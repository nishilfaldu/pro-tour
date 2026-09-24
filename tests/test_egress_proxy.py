import asyncio
import socket
import tempfile

import pytest

from pro_tour import egress_proxy


@pytest.mark.parametrize(
    "target",
    [
        "api.typesafe.ai:443",
        "example.com:80",
        "EXAMPLE.COM:443",
        "example.com.:443",
        "example.com.evil.test:443",
        "example.com@127.0.0.1:443",
        "127.0.0.1:443",
        "[::1]:443",
        "2130706433:443",
        "example.com:443/path",
        "example.com:0443",
    ],
)
def test_browser_proxy_rejects_provider_and_authority_bypasses(target):
    with pytest.raises(ValueError):
        egress_proxy.destination(
            f"CONNECT {target} HTTP/1.1\r\n\r\n".encode(), egress_proxy.POLICIES["public"]
        )


def test_proxy_accepts_only_its_role_and_tls_connect():
    for role, hosts in egress_proxy.POLICIES.items():
        for host in hosts:
            header = f"CONNECT {host}:443 HTTP/1.1\r\nHost: {host}\r\n\r\n".encode()
            assert egress_proxy.destination(header, hosts) == host
            other = "provider" if role == "public" else "public"
            with pytest.raises(ValueError):
                egress_proxy.destination(header, egress_proxy.POLICIES[other])
    for header in (
        b"GET https://example.com/ HTTP/1.1\r\n\r\n",
        b"CONNECT example.com:443 HTTP/1.1\n\n",
        b"CONNECT example.com:443 HTTP/1.1\r\n" + b"a" * 8192 + b"\r\n\r\n",
    ):
        with pytest.raises(ValueError):
            egress_proxy.destination(header, egress_proxy.POLICIES["public"])


def answer(ip, port=443):
    family = socket.AF_INET6 if ":" in ip else socket.AF_INET
    return (family, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (ip, port))


@pytest.mark.parametrize(
    "ip",
    [
        "127.0.0.1",
        "0.0.0.0",
        "10.0.0.1",
        "172.17.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "224.0.0.1",
        "::1",
        "::",
        "fc00::1",
        "fe80::1",
        "ff00::1",
        "::ffff:8.8.8.8",
        "::ffff:127.0.0.1",
    ],
)
def test_entire_dns_answer_is_denied_if_any_address_is_unsafe(ip):
    with pytest.raises(ValueError):
        egress_proxy.public_addresses([answer("8.8.8.8"), answer(ip)])


def test_validated_addresses_keep_numeric_sockaddrs():
    answers = [answer("8.8.8.8"), answer("2606:4700:4700::1111")]
    assert egress_proxy.public_addresses(answers) == answers
    with pytest.raises(ValueError):
        egress_proxy.public_addresses([answer("8.8.8.8", 80)])
    with pytest.raises(ValueError):
        egress_proxy.public_addresses([])


def test_denied_tunnel_never_dials_and_allowed_tunnel_relays_opaque_bytes(monkeypatch):
    async def scenario():
        calls = []

        async def echo(reader, writer):
            writer.write(await reader.read(5))
            await writer.drain()
            writer.close()

        upstream = await asyncio.start_server(echo, "127.0.0.1", 0)

        async def fake_connect(host):
            calls.append(host)
            return await asyncio.open_connection("127.0.0.1", upstream.sockets[0].getsockname()[1])

        monkeypatch.setattr(egress_proxy, "connect", fake_connect)
        path = temporary + "/proxy.sock"

        async def handler(reader, writer):
            await egress_proxy.tunnel(
                reader, writer, egress_proxy.POLICIES["public"], asyncio.Semaphore(1)
            )

        proxy = await asyncio.start_unix_server(handler, path)
        async with upstream, proxy:
            reader, writer = await asyncio.open_unix_connection(path)
            writer.write(b"CONNECT api.typesafe.ai:443 HTTP/1.1\r\n\r\n")
            await writer.drain()
            assert (await reader.read()).startswith(b"HTTP/1.1 403")
            writer.close()
            await writer.wait_closed()
            assert not calls
            reader, writer = await asyncio.open_unix_connection(path)
            writer.write(b"CONNECT example.com:443 HTTP/1.1\r\n\r\n")
            await writer.drain()
            assert (await reader.readuntil(b"\r\n\r\n")).startswith(b"HTTP/1.1 200")
            writer.write(b"\x16\x03\x03\x00\x00")  # opaque bytes, not parsed/decrypted TLS
            await writer.drain()
            assert await reader.readexactly(5) == b"\x16\x03\x03\x00\x00"
            writer.close()
            await writer.wait_closed()
            assert calls == ["example.com"]

    # Darwin's sockaddr_un cannot fit pytest's long default temporary paths.
    with tempfile.TemporaryDirectory(prefix="pt-", dir="/tmp") as temporary:
        asyncio.run(scenario())


def test_tunnel_deadline_closes_a_peer_that_never_sends_headers():
    class Writer:
        data = b""
        closed = False

        def write(self, data):
            self.data += data

        def close(self):
            self.closed = True

    async def scenario():
        writer = Writer()
        await egress_proxy.tunnel(
            asyncio.StreamReader(), writer, frozenset(), asyncio.Semaphore(1), lifetime=0.01
        )
        assert writer.closed
        assert writer.data.startswith(b"HTTP/1.1 403")

    asyncio.run(scenario())

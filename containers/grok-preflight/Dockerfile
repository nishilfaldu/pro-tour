FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
RUN apt-get update && apt-get install -y --no-install-recommends \
    socat iproute2 git libstdc++6 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY cursor /opt/cursor
COPY runtime.py tool_gate.py gateway.py /opt/grok/
COPY egress_proxy.py /opt/grok/egress_proxy.py
COPY cli-config.json /opt/policy/cli-config.json
COPY excluded-tools.txt /opt/policy/excluded-tools.txt
COPY hooks.json /etc/cursor/hooks.json
RUN install -d -o 10000 -g 10000 /run/pro-tour/grok /workspace
USER 10000:10000
WORKDIR /workspace
ENTRYPOINT ["python", "/opt/grok/runtime.py"]

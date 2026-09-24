FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium socat iproute2 procps ca-certificates libseccomp2 \
    && rm -rf /var/lib/apt/lists/*
# This context is assembled in an external temporary directory, never the repo.
# requirements.txt is exported from the unchanged upstream uv.lock with hashes.
COPY requirements.txt /opt/preflight/requirements.txt
RUN pip install --no-cache-dir --require-hashes -r /opt/preflight/requirements.txt
COPY upstream /opt/upstream
COPY source.json /opt/preflight/source.json
COPY runtime.py /opt/preflight/runtime.py
COPY egress_proxy.py /opt/preflight/egress_proxy.py
COPY sitecustomize.py /opt/observer/sitecustomize.py
RUN install -d -o 10000 -g 10000 /run/pro-tour/public /run/pro-tour/provider \
    /run/pro-tour/control /workspace
USER 10000:10000
WORKDIR /opt/upstream
ENTRYPOINT ["python", "/opt/preflight/runtime.py"]

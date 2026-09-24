# This image is only a synthetic boundary fixture, not the production runner.
FROM python:3.12.12-slim-bookworm@sha256:593bd06efe90efa80dc4eee3948be7c0fde4134606dd40d8dd8dbcade98e669c

# No repository files, host environment, or supplied credentials enter the build.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium socat iproute2 procps ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /opt/probe/requirements.txt
RUN pip install --no-cache-dir --require-hashes -r /opt/probe/requirements.txt
RUN install -d -o 10000 -g 10000 /run/pro-tour/app /run/pro-tour/control /workspace
COPY fixture.py /opt/probe/fixture.py
USER 10000:10000
WORKDIR /workspace
ENTRYPOINT ["python", "/opt/probe/fixture.py"]

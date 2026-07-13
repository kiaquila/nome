FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS builder

ARG UV_VERSION=0.10.11

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

WORKDIR /app

RUN python -m venv /opt/uv \
    && /opt/uv/bin/pip install --no-cache-dir "uv==${UV_VERSION}"

COPY pyproject.toml uv.lock README.md ./
COPY src ./src

RUN /opt/uv/bin/uv lock --check \
    && /opt/uv/bin/uv sync \
        --frozen \
        --no-dev \
        --no-editable \
        --reinstall-package nome

FROM python:3.12-slim-bookworm@sha256:8a7e7cc04fd3e2bd787f7f24e22d5d119aa590d429b50c95dfe12b3abe52f48b AS runtime

ARG RELEASE_SHA=unknown

LABEL io.nome.managed="true" \
      org.opencontainers.image.title="nome" \
      org.opencontainers.image.revision="${RELEASE_SHA}" \
      org.opencontainers.image.source="https://github.com/kiaquila/nome"

ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

RUN mkdir /app/data \
    && chown 10001:10001 /app/data

USER 10001:10001

EXPOSE 8000
STOPSIGNAL SIGTERM

HEALTHCHECK --interval=2s --timeout=2s --start-period=5s --retries=30 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=2).read()"]

CMD ["python", "-m", "uvicorn", "nome.app:app", "--host", "0.0.0.0", "--port", "8000"]

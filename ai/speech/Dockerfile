FROM python:3.12.15-slim-bookworm AS engine
ARG WHISPER_VERSION=1.9.6
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl cmake build-essential \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN curl --fail --silent --show-error --location --retry 3 \
      "https://codeload.github.com/ggml-org/whisper.cpp/tar.gz/refs/tags/v${WHISPER_VERSION}" \
      --output /tmp/whisper.tar.gz \
    && tar --extract --gzip --file /tmp/whisper.tar.gz --strip-components=1 \
    && cmake -S . -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
      -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF \
    && cmake --build /build --target whisper-cli --parallel 3

FROM python:3.12.15-slim-bookworm AS model
WORKDIR /model
COPY ai/speech/fetch_model.py /tmp/fetch_model.py
RUN python3 /tmp/fetch_model.py

FROM python:3.12.15-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=0444 --from=model /model/ggml-base-q5_1.bin /opt/cooklens/
COPY --from=engine /build/bin/whisper-cli /usr/local/bin/
COPY --from=engine /src/LICENSE /opt/cooklens/whisper.cpp-LICENSE
ENV PYTHONDONTWRITEBYTECODE=1
COPY ai/speech/serve.py /opt/cooklens/serve.py
USER 10001:10001
EXPOSE 8002
HEALTHCHECK --interval=20s --timeout=3s --start-period=8s \
  CMD python3 -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8002/health', timeout=2)"
ENTRYPOINT ["python3", "/opt/cooklens/serve.py"]

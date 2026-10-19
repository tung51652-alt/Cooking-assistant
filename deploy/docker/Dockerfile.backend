FROM maven:3.9.11-eclipse-temurin-21 AS build
WORKDIR /src
COPY backend/pom.xml backend/pom.xml
# Retry transient repository misses; -U rechecks Maven's cached missing artifacts.
RUN for attempt in 1 2 3; do \
      mvn -B -q -U -f backend/pom.xml dependency:go-offline && break; \
      if [ "$attempt" -eq 3 ]; then exit 1; fi; \
      sleep 10; \
    done
COPY backend/src/main backend/src/main
COPY data/processed/30vnfoods-label-map.json data/processed/30vnfoods-label-map.json
COPY deploy/artifacts/manifest.json deploy/artifacts/manifest.json
RUN mvn -B -q -f backend/pom.xml -Dmaven.test.skip=true package

FROM eclipse-temurin:21.0.12.1_1-jre-jammy
WORKDIR /app
RUN mkdir -p /app/health/com/cooklens/config && chmod 0755 /app/health /app/health/com /app/health/com/cooklens /app/health/com/cooklens/config
COPY --from=build --chmod=0444 /src/backend/target/cooklens-backend.jar /app/cooklens-backend.jar
COPY --from=build --chmod=0444 /src/backend/target/classes/com/cooklens/config/HealthProbe.class /app/health/com/cooklens/config/HealthProbe.class
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=70 -XX:+ExitOnOutOfMemoryError -Djava.io.tmpdir=/tmp"
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=3 \
  CMD ["java", "-cp", "/app/health", "com.cooklens.config.HealthProbe"]
ENTRYPOINT ["java", "-jar", "/app/cooklens-backend.jar"]

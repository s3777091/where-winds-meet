FROM golang:1.27-bookworm AS builder
WORKDIR /src
COPY go.work ./
COPY services/api/go.mod services/api/go.sum services/api/
RUN cd services/api && go mod download
COPY services/api services/api
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/wwm-api ./services/api/cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=builder /out/wwm-api /app/wwm-api
COPY data/guides /app/data/guides
COPY data/seed /app/data/seed
USER nonroot:nonroot
EXPOSE 3200
ENTRYPOINT ["/app/wwm-api"]

/**
 * OpenTelemetry (opcional). Para ativar tracing distribuído:
 * 1. npm install @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
 *    @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources @opentelemetry/semantic-conventions
 * 2. Iniciar com: node -r ./dist/instrumentation.js dist/index.js
 *
 * Exemplo de configuração (descomente e ajuste quando OTel estiver instalado):
 *
 * import { NodeSDK } from '@opentelemetry/sdk-node';
 * import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
 * import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
 * import { Resource } from '@opentelemetry/resources';
 * const traceExporter = new OTLPTraceExporter({
 *   url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger-collector:4318/v1/traces',
 * });
 * const sdk = new NodeSDK({
 *   resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'order-service' }),
 *   traceExporter,
 *   instrumentations: [getNodeAutoInstrumentations()],
 * });
 * sdk.start();
 */

export {};

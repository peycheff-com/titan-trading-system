import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

// Configure the SDK
const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'titan-brain',
  }),
  traceExporter: new OTLPTraceExporter({
    // Tempo usually listens on 4317 for gRPC
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://titan-tempo:4317',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

// Initialize the SDK and catch any errors
try {
  sdk.start();
  console.log('✅ OpenTelemetry SDK started');
} catch (error) {
  console.error('❌ Failed to start OpenTelemetry SDK:', error);
}

// Gracefully shut down the SDK on process exit
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('OpenTelemetry SDK shut down'))
    .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error))
    .finally(() => process.exit(0));
});

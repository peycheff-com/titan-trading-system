import { Bench } from "tinybench";
const bench = new Bench({ time: 100 });
// Simulation of Order Validation (Critical Path)
function validateOrder(order) {
    if (order.price <= 0)
        return false;
    if (order.quantity <= 0)
        return false;
    return true;
}
// Simulation of Risk Check (Critical Path)
function checkRisk(order, limits) {
    if (order.quantity * order.price > limits.maxNotional)
        return false;
    return true;
}
const order = { id: "1", price: 100, quantity: 1 };
const limits = { maxNotional: 10000 };
bench
    .add("Order Validation", () => {
    validateOrder(order);
})
    .add("Risk Check", () => {
    checkRisk(order, limits);
});
console.log("🚀 Running Performance Benchmarks...");
await bench.run();
console.table(bench.table());
// Regression Gate logic
const results = bench.results;
// Example: Assert ops/sec > Threshold
const validationTask = bench.getTask("Order Validation");
if (validationTask && validationTask.result &&
    validationTask.result.hz < 10000) { // Ridiculously low threshold for example
    console.error("❌ Performance Regression: Order Validation too slow!");
    process.exit(1);
}
console.log("✅ Performance Gates Passed.");
//# sourceMappingURL=latency.bench.js.map
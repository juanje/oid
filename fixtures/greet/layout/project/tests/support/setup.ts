// Runs before every unit test: no test may reach the network.
globalThis.fetch = () => Promise.reject(new Error("No unit test reaches the network"));

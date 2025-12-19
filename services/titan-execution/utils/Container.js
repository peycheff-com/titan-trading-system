/**
 * Simple Dependency Injection Container
 * Provides service registration and lazy instantiation
 */
export class Container {
  #services = new Map();
  #factories = new Map();
  #singletons = new Set();

  /**
   * Register a service factory
   * @param {string} name - Service name
   * @param {Function} factory - Factory function that receives container instance
   * @param {boolean} singleton - Whether to cache the instance
   */
  register(name, factory, singleton = true) {
    this.#factories.set(name, factory);
    if (singleton) {
      this.#singletons.add(name);
    }
  }

  /**
   * Get a service instance
   * @param {string} name - Service name
   * @returns {*} Service instance
   */
  get(name) {
    if (this.#singletons.has(name) && this.#services.has(name)) {
      return this.#services.get(name);
    }

    const factory = this.#factories.get(name);
    if (!factory) {
      throw new Error(`Service '${name}' not registered`);
    }

    const instance = factory(this);
    
    if (this.#singletons.has(name)) {
      this.#services.set(name, instance);
    }

    return instance;
  }

  /**
   * Reset a service (force re-instantiation)
   * @param {string} name - Service name
   */
  reset(name) {
    this.#services.delete(name);
  }

  /**
   * Check if service is registered
   * @param {string} name - Service name
   * @returns {boolean}
   */
  has(name) {
    return this.#factories.has(name);
  }

  /**
   * Get all registered service names
   * @returns {string[]}
   */
  getServiceNames() {
    return Array.from(this.#factories.keys());
  }

  /**
   * Clear all services and factories
   */
  clear() {
    this.#services.clear();
    this.#factories.clear();
    this.#singletons.clear();
  }
}
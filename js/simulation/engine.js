import { wlsStrategy } from './wls.js';

class SimulationEngine {
  constructor() {
    this.strategies = new Map();
    this.current = null;
  }

  registerStrategy(name, strategy) {
    this.strategies.set(name, strategy);
    if (!this.current) this.current = name;
  }

  setStrategy(name) {
    if (!this.strategies.has(name)) {
      throw new Error(`仿真策略不存在: ${name}`);
    }
    this.current = name;
  }

  run(mode, params) {
    if (!this.current || !this.strategies.has(this.current)) {
      throw new Error('未配置仿真策略');
    }
    return this.strategies.get(this.current).run({ ...params, mode });
  }
}

export const simulationEngine = new SimulationEngine();
simulationEngine.registerStrategy(wlsStrategy.name, wlsStrategy);

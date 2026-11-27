// Simple event system for cross-component communication
type EventCallback = (data?: any) => void;

class EventEmitter {
  private events: Map<string, EventCallback[]>;

  constructor() {
    this.events = new Map();
  }

  on(event: string, callback: EventCallback) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(callback);
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.events.get(event);
    if (!callbacks) return;
    const index = callbacks.indexOf(callback);
    if (index !== -1) {
      callbacks.splice(index, 1);
    }
  }

  emit(event: string, data?: any) {
    const callbacks = this.events.get(event);
    if (!callbacks) return;
    callbacks.forEach(callback => callback(data));
  }
}

export const eventEmitter = new EventEmitter();

export const EVENTS = {
  SWITCH_TAB: 'switch_tab',
  SWITCH_TO_SPINNER: 'switch_to_spinner',
};

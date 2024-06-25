export {EventEmitter} from "npm:eventemitter3@5.0.1";
import {EventEmitter} from "npm:eventemitter3@5.0.1";

export enum CacheEvent {
  GET = 'get',
  SET = 'set',
  TTL = 'ttl',
  DELETE = 'delete',
  HIT = 'hit',
  MISS = 'miss',
}

export const OP = 'cache:op'

export const buildOpFn = (emitter: EventEmitter, store: string): (action: CacheEvent, args?: {}) => void => {
  return (action: CacheEvent, args = {}) => {
    emitter.emit(OP, { action, store: store, __now__: new Date(), ...args });
  };
};

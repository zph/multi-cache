export {EventEmitter} from "npm:eventemitter3";
import {EventEmitter} from "npm:eventemitter3";

export enum CacheEvent {
  GET = 'get',
  SET = 'set',
  TTL = 'ttl',
  DELETE = 'delete',
  HIT = 'hit',
  MISS = 'miss',
}

export const OP = 'cache:op'

export const buildOpFn = (emitter: EventEmitter, store: string) => {
  return (action: CacheEvent, args = {}) => {
    emitter.emit(OP, { action, store: store, __now__: new Date(), ...args });
  };
};

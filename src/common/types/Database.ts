import { Event } from './Event';
import { Snapshot } from './Snapshot';

export type Database = {
  events: Event[];
  snapshots: Snapshot[];
};

import { Event } from './Event';
import { Snapshot } from './Snapshot';
export declare type Database = {
    events: Event[];
    snapshots: Snapshot[];
};

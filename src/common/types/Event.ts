import { AggregateId } from './AggregateId';

export type Event = {
  aggregate: {
    id: AggregateId;
  };
  data: {};
  metadata: {
    revision: number;
    published: boolean;
    position: number;
  };
};

import { EventEmitter } from 'events';
import { Eventstore } from './Eventstore';
import { assert } from 'assertthat';
import { Event } from '../index';
import { toArray } from 'streamtoarray';
import { v4 as uuid } from 'uuid';

describe('InMemory', () => {
  let eventstore: Eventstore;
  let namespace: string;

  beforeEach(() => {
    eventstore = new Eventstore();
    namespace = uuid();
  });

  afterEach(async function () {
    await eventstore.destroy();
  });

  it('is a function.', async () => {
    assert.that(Eventstore).is.ofType('function');
  });

  it('is an event emitter.', async () => {
    assert.that(eventstore).is.instanceOf(EventEmitter);
  });

  describe('initialize', () => {
    it('is a function.', async () => {
      assert.that(eventstore.initialize).is.ofType('function');
    });

    it('does not throw an error if the database is reachable.', async () => {
      await assert.that(async () => {
        await eventstore.initialize();
      }).is.not.throwingAsync();
    });

    it('does not throw an error if tables, indexes & co. do already exist.', async () => {
      await assert.that(async () => {
        await eventstore.initialize();
        await eventstore.initialize();
      }).is.not.throwingAsync();
    });

    it('throws an error if the aggregate id and revision of the new event are already in use.', async () => {
      const event = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      event.metadata.revision = 1;

      await eventstore.initialize();
      await eventstore.saveEvents({events: event});

      await assert.that(async () => {
        await eventstore.saveEvents({ events: event });
      }).is.throwingAsync('Aggregate id and revision already exist.');
    });

    describe('event stream order', () => {
      it('assigns the position 1 to the first event.', async () => {
        const event = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        event.metadata.revision = 1;

        await eventstore.initialize();
        await eventstore.saveEvents({events: event});

        const eventStream = await eventstore.getEventStream(event.aggregate.id);
        const aggregateEvents = await toArray(eventStream);

        assert.that(aggregateEvents.length).is.equalTo(1);
        assert.that(aggregateEvents[0].metadata.position).is.equalTo(1);
      });

      it('assigns increasing positions to subsequent events.', async () => {
        const eventStarted = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        const eventJoined = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
          name: 'joined',
          data: { participant: 'Jane Doe' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        eventStarted.metadata.revision = 1;
        eventJoined.metadata.revision = 2;

        await eventstore.initialize();
        await eventstore.saveEvents({events: [ eventStarted, eventJoined]});

        const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id);
        const aggregateEvents = await toArray(eventStream);

        assert.that(aggregateEvents.length).is.equalTo(2);
        assert.that(aggregateEvents[0].metadata.position).is.equalTo(1);
        assert.that(aggregateEvents[1].metadata.position).is.equalTo(2);
      });

      it('assigns increasing positions even when saving the events individually.', async () => {
        const eventStarted = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        const eventJoined = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
          name: 'joined',
          data: { participant: 'Jane Doe' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        eventStarted.metadata.revision = 1;
        eventJoined.metadata.revision = 2;

        await eventstore.initialize();
        await eventstore.saveEvents({ events: eventStarted });
        await eventstore.saveEvents({ events: eventJoined });

        const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id);
        const aggregateEvents = await toArray(eventStream);

        assert.that(aggregateEvents.length).is.equalTo(2);
        assert.that(aggregateEvents[0].metadata.position).is.equalTo(1);
        assert.that(aggregateEvents[1].metadata.position).is.equalTo(2);
      });

      it('ensures that positions are unique across aggregates.', async () => {
        const eventStarted1 = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        const eventStarted2 = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        eventStarted1.metadata.revision = 1;
        eventStarted2.metadata.revision = 1;

        await eventstore.initialize();
        await eventstore.saveEvents({ events: eventStarted1 });
        await eventstore.saveEvents({ events: eventStarted2 });

        const eventStream1 = await eventstore.getEventStream(eventStarted1.aggregate.id);
        const aggregateEvents1 = await toArray(eventStream1);

        assert.that(aggregateEvents1.length).is.equalTo(1);
        assert.that(aggregateEvents1[0].metadata.position).is.equalTo(1);

        const eventStream2 = await eventstore.getEventStream(eventStarted2.aggregate.id);
        const aggregateEvents2 = await toArray(eventStream2);

        assert.that(aggregateEvents2.length).is.equalTo(1);
        assert.that(aggregateEvents2[0].metadata.position).is.equalTo(2);
      });

      it('returns the saved events enriched by their positions.', async () => {
        const event = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        event.metadata.revision = 1;

        await eventstore.initialize();
        const savedEvents = await eventstore.saveEvents({ events: event });

        assert.that(savedEvents.length).is.equalTo(1);
        assert.that(savedEvents[0].metadata.position).is.equalTo(1);
      });

      it('does not change the events that were given as arguments.', async () => {
        const event = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        event.metadata.revision = 1;

        await eventstore.initialize();
        await eventstore.saveEvents({ events: event });

        assert.that(event.metadata.position).is.undefined();
      });
    });
  });

  describe('getLastEvent', () => {
    it('is a function.', async () => {
      assert.that(eventstore.getLastEvent).is.ofType('function');
    });

    it('throws an error if aggregate id is missing.', async () => {
      await assert.that(async () => {
        await eventstore.getLastEvent(<any>null);
      }).is.throwingAsync('Aggregate id is missing.');
    });

    it('returns undefined for an aggregate without events.', async () => {
      await eventstore.initialize();
      const event = await eventstore.getLastEvent(uuid());

      assert.that(event).is.undefined();
    });

    it('returns the last event for the given aggregate.', async () => {
      const aggregateId = uuid();

      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      const event = await eventstore.getLastEvent(aggregateId);

      assert.that(event.name).is.equalTo('joined');
      assert.that(event.metadata.revision).is.equalTo(2);
    });

    it('correctly handles null, undefined and empty arrays.', async () => {
      const aggregateId = uuid();

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: aggregateId },
        name: 'joined',
        data: {
          initiator: null,
          destination: undefined,
          participants: []
        },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventJoined.metadata.revision = 1;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventJoined ]});

      const event = await eventstore.getLastEvent(aggregateId);

      assert.that(event.data.initiator).is.null();
      assert.that(event.data.participants).is.equalTo([]);
    });
  });

  describe('getEventStream', () => {
    it('is a function.', async () => {
      assert.that(eventstore.getEventStream).is.ofType('function');
    });

    it('throws an error if aggregate id is missing.', async () => {
      await assert.that(async () => {
        await eventstore.getEventStream(<any>null);
      }).is.throwingAsync('Aggregate id is missing.');
    });

    it('throws an error if from revision is greater than to revision.', async () => {
      await assert.that(async () => {
        await eventstore.getEventStream(uuid(), { fromRevision: 42, toRevision: 23 });
      }).is.throwingAsync('From revision is greater than to revision.');
    });

    it('returns an empty stream for a non-existent aggregate.', async () => {
      await eventstore.initialize();

      const eventStream = await eventstore.getEventStream(uuid());
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(0);
    });

    it('returns a stream of events for the given aggregate.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id);
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(2);
      assert.that(aggregateEvents[0].name).is.equalTo('started');
      assert.that(aggregateEvents[1].name).is.equalTo('joined');
    });

    it('returns a stream from revision.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id, { fromRevision: 2 });
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(1);
      assert.that(aggregateEvents[0].name).is.equalTo('joined');
    });

    it('returns a stream to revision.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id, { toRevision: 1 });
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(1);
      assert.that(aggregateEvents[0].name).is.equalTo('started');
    });
  });

  describe('getUnpublishedEventStream', () => {
    it('is a function.', async () => {
      assert.that(eventstore.getUnpublishedEventStream).is.ofType('function');
    });

    it('returns an empty stream if there are no unpublished events.', async () => {
      await eventstore.initialize();

      const eventStream = await eventstore.getUnpublishedEventStream();
      const unpublishedEvents = await toArray(eventStream);

      assert.that(unpublishedEvents.length).is.equalTo(0);
    });

    it('returns a stream of unpublished events.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventStarted.metadata.published = true;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      const eventStream = await eventstore.getUnpublishedEventStream();
      const unpublishedEvents = await toArray(eventStream);

      assert.that(unpublishedEvents.length).is.equalTo(1);
      assert.that(unpublishedEvents[0].name).is.equalTo('joined');
    });
  });

  describe('saveEvents', () => {
    it('is a function.', async () => {
      assert.that(eventstore.saveEvents).is.ofType('function');
    });

    it('throws an error if events are missing.', async () => {
      await assert.that(async () => {
        await eventstore.saveEvents(<any>{});
      }).is.throwingAsync('Events are missing.');
    });

    it('saves a single event.', async () => {
      const event = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      event.metadata.revision = 1;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: event });

      const eventStream = await eventstore.getEventStream(event.aggregate.id);
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(1);
      assert.that(aggregateEvents[0].name).is.equalTo('started');
    });

    it('saves multiple events.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id);
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(2);
      assert.that(aggregateEvents[0].name).is.equalTo('started');
      assert.that(aggregateEvents[1].name).is.equalTo('joined');
    });

    it('returns events with updated positions.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoined = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoined.metadata.revision = 2;

      await eventstore.initialize();
      const savedEvents = await eventstore.saveEvents({ events: [ eventStarted, eventJoined ]});

      assert.that(savedEvents.length).is.equalTo(2);
      assert.that(savedEvents[0].name).is.equalTo('started');
      assert.that(savedEvents[0].metadata.position).is.equalTo(1);
      assert.that(savedEvents[1].name).is.equalTo('joined');
      assert.that(savedEvents[1].metadata.position).is.equalTo(2);
    });

    it('correctly handles undefined and null.', async () => {
      const event = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: null, destination: undefined },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      event.metadata.revision = 1;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: event });

      const eventStream = await eventstore.getEventStream(event.aggregate.id);
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents.length).is.equalTo(1);
      assert.that(aggregateEvents[0].data).is.equalTo({ initiator: null });
    });
  });

  describe('markEventsAsPublished', () => {
    it('is a function.', async () => {
      assert.that(eventstore.markEventsAsPublished).is.ofType('function');
    });

    it('throws an error if aggregate id is missing.', async () => {
      await assert.that(async () => {
        await eventstore.markEventsAsPublished({});
      }).is.throwingAsync('Aggregate id is missing.');
    });

    it('throws an error if from revision is missing.', async () => {
      await assert.that(async () => {
        await eventstore.markEventsAsPublished({ aggregateId: uuid() });
      }).is.throwingAsync('From revision is missing.');
    });

    it('throws an error if to revision is missing.', async () => {
      await assert.that(async () => {
        await eventstore.markEventsAsPublished({ aggregateId: uuid(), fromRevision: 5 });
      }).is.throwingAsync('To revision is missing.');
    });

    it('marks the specified events as published.', async () => {
      const eventStarted = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: uuid() },
        name: 'started',
        data: { initiator: 'Jane Doe', destination: 'Riva' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoinedFirst = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jane Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      const eventJoinedSecond = new Event({
        context: { name: 'planning' },
        aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
        name: 'joined',
        data: { participant: 'Jennifer Doe' },
        metadata: { correlationId: uuid(), causationId: uuid() }
      });

      eventStarted.metadata.revision = 1;
      eventJoinedFirst.metadata.revision = 2;
      eventJoinedSecond.metadata.revision = 3;

      await eventstore.initialize();
      await eventstore.saveEvents({ events: [ eventStarted, eventJoinedFirst, eventJoinedSecond ]});

      await eventstore.markEventsAsPublished({
        aggregateId: eventStarted.aggregate.id,
        fromRevision: 1,
        toRevision: 2
      });

      const eventStream = await eventstore.getEventStream(eventStarted.aggregate.id);
      const aggregateEvents = await toArray(eventStream);

      assert.that(aggregateEvents[0].metadata.published).is.true();
      assert.that(aggregateEvents[1].metadata.published).is.true();
      assert.that(aggregateEvents[2].metadata.published).is.false();
    });
  });

  describe('getSnapshot', () => {
    it('is a function.', async () => {
      assert.that(eventstore.getSnapshot).is.ofType('function');
    });

    it('throws an error if aggregate id is missing.', async () => {
      await assert.that(async () => {
        await eventstore.getSnapshot(<any>null);
      }).is.throwingAsync('Aggregate id is missing.');
    });

    it('returns undefined for an aggregate without a snapshot.', async () => {
      await eventstore.initialize();

      const snapshot = await eventstore.getSnapshot(uuid());

      assert.that(snapshot).is.undefined();
    });

    it('returns a snapshot for the given aggregate.', async () => {
      const aggregateId = uuid();
      const state = {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: [ 'Jane Doe' ]
      };

      await eventstore.initialize();
      await eventstore.saveSnapshot({ aggregateId, revision: 5, state });

      const snapshot = await eventstore.getSnapshot(aggregateId);

      assert.that(snapshot).is.equalTo({
        revision: 5,
        state
      });
    });

    it('correctly handles null, undefined and empty arrays.', async () => {
      const aggregateId = uuid();

      const state = {
        initiator: null,
        destination: undefined,
        participants: []
      };

      await eventstore.initialize();
      await eventstore.saveSnapshot({ aggregateId, revision: 5, state });

      const snapshot = await eventstore.getSnapshot(aggregateId);

      assert.that(snapshot.revision).is.equalTo(5);
      assert.that(snapshot.state).is.equalTo({
        initiator: null,
        participants: []
      });
    });

    it('returns the newest snapshot for the given aggregate.', async () => {
      const aggregateId = uuid();

      const stateOld = {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: [ 'Jane Doe' ]
      };

      const stateNew = {
        initiator: 'Jane Doe',
        destination: 'Moulou',
        participants: [ 'Jane Doe', 'Jenny Doe' ]
      };

      await eventstore.initialize();
      await eventstore.saveSnapshot({ aggregateId, revision: 5, state: stateOld });
      await eventstore.saveSnapshot({ aggregateId, revision: 10, state: stateNew });

      const snapshot = await eventstore.getSnapshot(aggregateId);

      assert.that(snapshot).is.equalTo({
        revision: 10,
        state: stateNew
      });
    });
  });

  describe('saveSnapshot', () => {
    it('is a function.', async () => {
      assert.that(eventstore.saveSnapshot).is.ofType('function');
    });

    it('throws an error if aggregate id is missing.', async () => {
      await assert.that(async () => {
        await eventstore.saveSnapshot({});
      }).is.throwingAsync('Aggregate id is missing.');
    });

    it('throws an error if revision is missing.', async () => {
      await assert.that(async () => {
        await eventstore.saveSnapshot({ aggregateId: uuid() });
      }).is.throwingAsync('Revision is missing.');
    });

    it('throws an error if state is missing.', async () => {
      await assert.that(async () => {
        await eventstore.saveSnapshot({ aggregateId: uuid(), revision: 10 });
      }).is.throwingAsync('State is missing.');
    });

    it('saves a snapshot.', async () => {
      const aggregateId = uuid();
      const state = {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: [ 'Jane Doe' ]
      };

      await eventstore.initialize();
      await eventstore.saveSnapshot({ aggregateId, revision: 10, state });

      const snapshot = await eventstore.getSnapshot(aggregateId);

      assert.that(snapshot).is.equalTo({
        revision: 10,
        state
      });
    });

    it('correctly handles null, undefined and empty arrays.', async () => {
      const aggregateId = uuid();
      const state = {
        initiator: null,
        destination: undefined,
        participants: []
      };

      await eventstore.initialize();
      await eventstore.saveSnapshot({ aggregateId, revision: 10, state });

      const snapshot = await eventstore.getSnapshot(aggregateId);

      assert.that(snapshot).is.equalTo({
        revision: 10,
        state: {
          initiator: null,
          participants: []
        }
      });
    });

    it('does not throw an error if trying to save an already saved snapshot.', async () => {
      const aggregateId = uuid();
      const state = {
        initiator: 'Jane Doe',
        destination: 'Riva',
        participants: [ 'Jane Doe' ]
      };

      await eventstore.initialize();
      await eventstore.saveSnapshot({ aggregateId, revision: 10, state });
      await eventstore.saveSnapshot({ aggregateId, revision: 10, state });
    });
  });

  describe('getReplay', () => {
    it('is a function.', async () => {
      assert.that(eventstore.getReplay).is.ofType('function');
    });

    it('throws an error if fromPosition is greater than toPosition.', async () => {
      await assert.that(async () => {
        await eventstore.getReplay({ fromPosition: 23, toPosition: 7 });
      }).is.throwingAsync('From position is greater than to position.');
    });

    it('returns an empty stream.', async () => {
      await eventstore.initialize();

      const replayStream = await eventstore.getReplay();
      const replayEvents = await toArray(replayStream);

      assert.that(replayEvents.length).is.equalTo(0);
    });

    describe('with existent data', () => {
      beforeEach(async () => {
        const eventStarted = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: uuid() },
          name: 'started',
          data: { initiator: 'Jane Doe', destination: 'Riva' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        const eventJoinedFirst = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
          name: 'joined',
          data: { participant: 'Jane Doe' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        const eventJoinedSecond = new Event({
          context: { name: 'planning' },
          aggregate: { name: 'peerGroup', id: eventStarted.aggregate.id },
          name: 'joined',
          data: { participant: 'Jennifer Doe' },
          metadata: { correlationId: uuid(), causationId: uuid() }
        });

        eventStarted.metadata.revision = 1;
        eventJoinedFirst.metadata.revision = 2;
        eventJoinedSecond.metadata.revision = 3;

        await eventstore.initialize();
        await eventstore.saveEvents({ events: [ eventStarted, eventJoinedFirst, eventJoinedSecond ]});
      });

      it('returns all events if no options are given.', async () => {
        const replayStream = await eventstore.getReplay();
        const replayEvents = await toArray(replayStream);

        assert.that(replayEvents.length).is.equalTo(3);
        assert.that(replayEvents[0].name).is.equalTo('started');
        assert.that(replayEvents[0].metadata.position).is.equalTo(1);
        assert.that(replayEvents[1].name).is.equalTo('joined');
        assert.that(replayEvents[1].metadata.position).is.equalTo(2);
        assert.that(replayEvents[2].name).is.equalTo('joined');
        assert.that(replayEvents[2].metadata.position).is.equalTo(3);
      });

      it('returns all events from the given position.', async () => {
        const replayStream = await eventstore.getReplay({ fromPosition: 2 });
        const replayEvents = await toArray(replayStream);

        assert.that(replayEvents.length).is.equalTo(2);
        assert.that(replayEvents[0].name).is.equalTo('joined');
        assert.that(replayEvents[0].metadata.position).is.equalTo(2);
        assert.that(replayEvents[1].name).is.equalTo('joined');
        assert.that(replayEvents[1].metadata.position).is.equalTo(3);
      });

      it('returns all events to the given position.', async () => {
        const replayStream = await eventstore.getReplay({ toPosition: 2 });
        const replayEvents = await toArray(replayStream);

        assert.that(replayEvents.length).is.equalTo(2);
        assert.that(replayEvents[0].name).is.equalTo('started');
        assert.that(replayEvents[0].metadata.position).is.equalTo(1);
        assert.that(replayEvents[1].name).is.equalTo('joined');
        assert.that(replayEvents[1].metadata.position).is.equalTo(2);
      });

      it('returns all events between the given positions.', async () => {
        const replayStream = await eventstore.getReplay({ fromPosition: 2, toPosition: 2 });
        const replayEvents = await toArray(replayStream);

        assert.that(replayEvents.length).is.equalTo(1);
        assert.that(replayEvents[0].name).is.equalTo('joined');
        assert.that(replayEvents[0].metadata.position).is.equalTo(2);
      });
    });
  });

  describe('destroy', () => {
    it('is a function.', async () => {
      assert.that(eventstore.destroy).is.ofType('function');
    });
  });
});

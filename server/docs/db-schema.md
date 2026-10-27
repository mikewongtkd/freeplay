# FreePlay Database Schema

**Technical reference**

Current state, entity relationships, constraints, and implementation
notes

| **Reference**     | **Value**                                                     |
| ----------------- | ------------------------------------------------------------- |
| Prepared          | October 27, 2026                                              |
| Structural source | deploy/db/schema.sql                                          |
| Runtime database  | FREEPLAY\_DB or /data/freeplay.sqlite                         |
| Database engine   | SQLite; WAL mode; foreign keys enabled; 5,000 ms busy timeout |
| Scope             | 19 application tables; SQLite internal tables excluded        |

**Purpose**

This document records the schema implemented in the repository at the
date above. It describes both the ingestion/test data model and the IVR
tournament/review data model, then identifies current integration
boundaries that affect how the tables are used.

# 1\. Executive summary

FreePlay uses one SQLite database for camera ingestion, media indexing,
protocol test evidence, and the emerging IVR review domain. The schema
is initialized by the Node ingestion service and can also be initialized
by the PHP review application when the IVR schema is
absent.

| **Area**              | **Tables** | **Responsibility**                                                                                                     |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| Ingestion/media       | 7          | Camera identity, connections, codec configuration, statistics, recordings, GOP lookup, and replay markers.             |
| Configuration/testing | 3          | Operational configuration plus test-run and test-result evidence.                                                      |
| IVR domain            | 9          | Tournament, ring, camera assignment, competitors, matches, review workflow, decisions, annotations, and audit history. |

## Current implementation boundary

The IVR match editor reads and writes ivr\_matches and its supporting
tournament/ring/competitor records. The formal review workflow API
currently stores active review requests in the PHP session
(freeplay\_ivr\_prototype), not in ivr\_review\_requests or its
decision, annotation, and audit tables. Those tables therefore represent
the intended persistence model but are not yet the authoritative live
workflow store.

## Initialization and migration behavior

  - src/freeplay.js opens FREEPLAY\_DB (default /data/freeplay.sqlite),
    applies non-destructive additive migrations, executes the schema,
    and enables foreign-key enforcement.

  - public/review/includes/api-common.php opens the same database,
    creates the schema only if ivr\_tournaments is absent, and adds
    referee/review\_jury to older ivr\_matches tables.

  - The schema uses CREATE TABLE/INDEX IF NOT EXISTS. It does not
    version migrations or rebuild existing constraints; additive
    compatibility is handled in application code.

# 2\. UML entity-relationship diagram

![UML entity-relationship diagram for the FreePlay ingestion, testing,
tournament, and IVR review database
tables.](images/db-schema/entity-relationship-diagram.png
"FreePlay database entity relationships")

*Figure 1. Logical entity relationships implemented by foreign keys.
Configuration is standalone; test runs own test
results.*

Each node represents an entity. Each arrow is labeled with the foreign-key
column on the referencing entity and points to the referenced entity. Primary
keys are omitted because each entity uses `id` as its primary key, except the
`ivr_ring_cameras` junction entity, whose composite key is described in the
data dictionary.

# 3\. Entity catalog

| **Domain**                | **Entity**                 | **Primary key**      | **References**                                  | **Purpose**                                                                                                 |
| ------------------------- | -------------------------- | -------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Ingestion and media       | cameras                    | id                   | —                                               | Registered camera/stream identity, device metadata, negotiated encoding targets, and latest observed state. |
| Ingestion and media       | sessions                   | id                   | cameras                                         | One camera connection/recording session, including negotiated media properties and lifetime counters.       |
| Ingestion and media       | codec\_configurations      | id                   | cameras, sessions                               | Versioned H.264 codec configuration (SPS/PPS and avcC) received during a session.                           |
| Ingestion and media       | statistics                 | id                   | cameras, sessions                               | Periodic ingestion, transport-quality, and replay-cache measurements for a camera/session.                  |
| Ingestion and media       | files                      | id                   | cameras, sessions                               | Recorded fMP4 file inventory and coverage boundaries.                                                       |
| Ingestion and media       | gop\_index                 | id                   | cameras, files, sessions                        | Random-access index of GOP time ranges, sequence ranges, and byte locations.                                |
| Ingestion and media       | events                     | id                   | cameras                                         | Generic ingestion/replay markers with ring context and pre/post-roll.                                       |
| Configuration and testing | configuration              | id                   | —                                               | Server configuration values stored as string key/value pairs.                                               |
| Configuration and testing | test\_runs                 | id                   | —                                               | Top-level execution record for an ingestion protocol test suite run.                                        |
| Configuration and testing | test\_results              | id                   | test\_runs                                      | Per-test outcome, measurements, observations, and recommendations.                                          |
| IVR tournament and review | ivr\_tournaments           | id                   | —                                               | Tournament-level container for rings, competitors, and scheduling context.                                  |
| IVR tournament and review | ivr\_rings                 | id                   | ivr\_tournaments                                | Tournament ring definition and active-state record.                                                         |
| IVR tournament and review | ivr\_ring\_cameras         | ring\_id, camera\_id | cameras, ivr\_rings                             | Many-to-many assignment of ingestion cameras to IVR rings, including sync offsets.                          |
| IVR tournament and review | ivr\_competitors           | id                   | ivr\_tournaments                                | Tournament competitor/team identity.                                                                        |
| IVR tournament and review | ivr\_matches               | id                   | ivr\_competitors, ivr\_rings                    | Match identity, participants, officials, quotas, lifecycle, and recording boundary.                         |
| IVR tournament and review | ivr\_review\_requests      | id                   | ivr\_matches, ivr\_review\_requests, ivr\_rings | Formal review request, review window, AUR marker, camera usage, and workflow state.                         |
| IVR tournament and review | ivr\_review\_decisions     | id                   | ivr\_review\_requests                           | One terminal disposition and quota outcome for a review request.                                            |
| IVR tournament and review | ivr\_review\_annotations   | id                   | ivr\_review\_requests                           | One post-review explanatory annotation for a review request.                                                |
| IVR tournament and review | ivr\_review\_audit\_events | id                   | ivr\_review\_requests                           | Append-oriented audit trail for review workflow actions.                                                    |

# 4\. Relationship and lifecycle rules

| **Foreign key**                                | **Referenced key**       | **On delete** | **On update** |
| ---------------------------------------------- | ------------------------ | ------------- | ------------- |
| codec\_configurations.session\_id              | sessions.id              | NO ACTION     | NO ACTION     |
| codec\_configurations.camera\_id               | cameras.id               | NO ACTION     | NO ACTION     |
| events.camera\_id                              | cameras.id               | SET NULL      | NO ACTION     |
| files.session\_id                              | sessions.id              | NO ACTION     | NO ACTION     |
| files.camera\_id                               | cameras.id               | NO ACTION     | NO ACTION     |
| gop\_index.file\_id                            | files.id                 | NO ACTION     | NO ACTION     |
| gop\_index.session\_id                         | sessions.id              | NO ACTION     | NO ACTION     |
| gop\_index.camera\_id                          | cameras.id               | NO ACTION     | NO ACTION     |
| ivr\_competitors.tournament\_id                | ivr\_tournaments.id      | CASCADE       | NO ACTION     |
| ivr\_matches.hong\_competitor\_id              | ivr\_competitors.id      | RESTRICT      | NO ACTION     |
| ivr\_matches.chung\_competitor\_id             | ivr\_competitors.id      | RESTRICT      | NO ACTION     |
| ivr\_matches.ring\_id                          | ivr\_rings.id            | RESTRICT      | NO ACTION     |
| ivr\_review\_annotations.review\_request\_id   | ivr\_review\_requests.id | CASCADE       | NO ACTION     |
| ivr\_review\_audit\_events.review\_request\_id | ivr\_review\_requests.id | CASCADE       | NO ACTION     |
| ivr\_review\_decisions.review\_request\_id     | ivr\_review\_requests.id | CASCADE       | NO ACTION     |
| ivr\_review\_requests.linked\_review\_id       | ivr\_review\_requests.id | SET NULL      | NO ACTION     |
| ivr\_review\_requests.match\_id                | ivr\_matches.id          | SET NULL      | NO ACTION     |
| ivr\_review\_requests.ring\_id                 | ivr\_rings.id            | RESTRICT      | NO ACTION     |
| ivr\_ring\_cameras.camera\_id                  | cameras.id               | CASCADE       | NO ACTION     |
| ivr\_ring\_cameras.ring\_id                    | ivr\_rings.id            | CASCADE       | NO ACTION     |
| ivr\_rings.tournament\_id                      | ivr\_tournaments.id      | CASCADE       | NO ACTION     |
| sessions.camera\_id                            | cameras.id               | CASCADE       | NO ACTION     |
| statistics.session\_id                         | sessions.id              | CASCADE       | NO ACTION     |
| statistics.camera\_id                          | cameras.id               | CASCADE       | NO ACTION     |
| test\_results.test\_run\_id                    | test\_runs.id            | CASCADE       | NO ACTION     |

## Key lifecycle implications

  - Deleting a camera cascades through sessions, statistics, and
    ring-camera assignments; codec, file, and GOP rows use the default
    restrictive behavior and may prevent deletion while referenced.

  - Deleting an IVR tournament cascades to rings and competitors;
    matches restrict ring and competitor deletion, preserving match
    integrity.

  - Deleting a review request cascades to its decision, annotation, and
    audit events. Match and self-linked review references are set to
    null when the referenced row is removed.

  - updated\_at values are defaults only: no database triggers update
    them automatically. Writers must set them on modification.

# 5\. Detailed data dictionary

## Ingestion and media

### cameras

Registered camera/stream identity, device metadata, negotiated encoding
targets, and latest observed
state.

| **Column**         | **SQLite type** | **Key / constraint / default**       |
| ------------------ | --------------- | ------------------------------------ |
| id                 | INTEGER         | PK                                   |
| stream\_id         | TEXT            | NOT NULL                             |
| ring\_no           | INTEGER         | —                                    |
| camera\_no         | INTEGER         | —                                    |
| device\_model      | TEXT            | —                                    |
| resolution         | TEXT            | —                                    |
| fps\_target        | REAL            | —                                    |
| bitrate\_target    | INTEGER         | —                                    |
| ring               | INTEGER         | —                                    |
| camera             | INTEGER         | —                                    |
| device             | TEXT            | —                                    |
| manufacturer       | TEXT            | —                                    |
| android\_version   | TEXT            | —                                    |
| app\_version       | TEXT            | —                                    |
| encoder            | TEXT            | —                                    |
| codec              | TEXT            | —                                    |
| width              | INTEGER         | —                                    |
| height             | INTEGER         | —                                    |
| fps                | REAL            | —                                    |
| bitrate            | INTEGER         | —                                    |
| keyframe\_interval | REAL            | —                                    |
| last\_seen\_at     | TEXT            | —                                    |
| created\_at        | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at        | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_cameras\_ring\_camera (ring, camera)

### sessions

One camera connection/recording session, including negotiated media
properties and lifetime
counters.

| **Column**             | **SQLite type** | **Key / constraint / default** |
| ---------------------- | --------------- | ------------------------------ |
| id                     | INTEGER         | PK                             |
| camera\_id             | INTEGER         | NOT NULL, FK → cameras.id      |
| stream\_id             | TEXT            | —                              |
| start\_time            | TEXT            | —                              |
| end\_time              | TEXT            | —                              |
| started\_at            | TEXT            | —                              |
| ended\_at              | TEXT            | —                              |
| remote\_address        | TEXT            | —                              |
| codec                  | TEXT            | —                              |
| width                  | INTEGER         | —                              |
| height                 | INTEGER         | —                              |
| fps                    | REAL            | —                              |
| bitrate                | INTEGER         | —                              |
| keyframe\_interval     | REAL            | —                              |
| encoder                | TEXT            | —                              |
| codec\_config\_version | INTEGER         | NOT NULL, DEFAULT 0            |
| disconnect\_reason     | TEXT            | —                              |
| bytes\_total           | INTEGER         | NOT NULL, DEFAULT 0            |
| frames\_total          | INTEGER         | NOT NULL, DEFAULT 0            |
| dropped\_total         | INTEGER         | NOT NULL, DEFAULT 0            |
| keyframes\_total       | INTEGER         | NOT NULL, DEFAULT 0            |
| recording\_path        | TEXT            | —                              |

**Indexes:** idx\_sessions\_camera\_started (camera\_id, started\_at)

### codec\_configurations

Versioned H.264 codec configuration (SPS/PPS and avcC) received during a
session.

| **Column**   | **SQLite type** | **Key / constraint / default** |
| ------------ | --------------- | ------------------------------ |
| id           | INTEGER         | PK                             |
| camera\_id   | INTEGER         | NOT NULL, FK → cameras.id      |
| session\_id  | INTEGER         | NOT NULL, FK → sessions.id     |
| version      | INTEGER         | NOT NULL                       |
| received\_at | TEXT            | NOT NULL                       |
| pts\_us      | TEXT            | —                              |
| format       | TEXT            | NOT NULL, DEFAULT 'avcC'       |
| sps          | BLOB            | NOT NULL                       |
| pps          | BLOB            | NOT NULL                       |
| avcc         | BLOB            | NOT NULL                       |

**Indexes:** idx\_codec\_config\_session (session\_id, version)

### statistics

Periodic ingestion, transport-quality, and replay-cache measurements for
a
camera/session.

| **Column**                  | **SQLite type** | **Key / constraint / default** |
| --------------------------- | --------------- | ------------------------------ |
| id                          | INTEGER         | PK                             |
| camera\_id                  | INTEGER         | NOT NULL, FK → cameras.id      |
| session\_id                 | INTEGER         | FK → sessions.id               |
| ts                          | TEXT            | —                              |
| sample\_time                | TEXT            | —                              |
| fps                         | REAL            | NOT NULL, DEFAULT 0            |
| bitrate                     | INTEGER         | NOT NULL, DEFAULT 0            |
| bitrate\_bps                | INTEGER         | NOT NULL, DEFAULT 0            |
| frames                      | INTEGER         | NOT NULL, DEFAULT 0            |
| dropped                     | INTEGER         | NOT NULL, DEFAULT 0            |
| bytes                       | INTEGER         | NOT NULL, DEFAULT 0            |
| keyframes                   | INTEGER         | NOT NULL, DEFAULT 0            |
| reconnects                  | INTEGER         | NOT NULL, DEFAULT 0            |
| bytes\_received             | INTEGER         | NOT NULL, DEFAULT 0            |
| buffers\_received           | INTEGER         | NOT NULL, DEFAULT 0            |
| codec\_config\_buffers      | INTEGER         | NOT NULL, DEFAULT 0            |
| sequence\_gaps              | INTEGER         | NOT NULL, DEFAULT 0            |
| estimated\_missing\_buffers | INTEGER         | NOT NULL, DEFAULT 0            |
| ram\_cache\_seconds         | REAL            | NOT NULL, DEFAULT 0            |
| ram\_cache\_bytes           | INTEGER         | NOT NULL, DEFAULT 0            |

**Indexes:** idx\_statistics\_session\_sample (session\_id,
sample\_time); idx\_statistics\_camera\_ts (camera\_id, ts)

### files

Recorded fMP4 file inventory and coverage
boundaries.

| **Column**             | **SQLite type** | **Key / constraint / default** |
| ---------------------- | --------------- | ------------------------------ |
| id                     | INTEGER         | PK                             |
| camera\_id             | INTEGER         | NOT NULL, FK → cameras.id      |
| session\_id            | INTEGER         | NOT NULL, FK → sessions.id     |
| path                   | TEXT            | NOT NULL                       |
| started\_at            | TEXT            | NOT NULL                       |
| ended\_at              | TEXT            | —                              |
| start\_pts\_us         | TEXT            | —                              |
| end\_pts\_us           | TEXT            | —                              |
| byte\_size             | INTEGER         | NOT NULL, DEFAULT 0            |
| gop\_count             | INTEGER         | NOT NULL, DEFAULT 0            |
| codec\_config\_version | INTEGER         | —                              |
| complete               | INTEGER         | NOT NULL, DEFAULT 0            |

**Indexes:** idx\_files\_camera\_started (camera\_id, started\_at)

### gop\_index

Random-access index of GOP time ranges, sequence ranges, and byte
locations.

| **Column**                  | **SQLite type** | **Key / constraint / default** |
| --------------------------- | --------------- | ------------------------------ |
| id                          | INTEGER         | PK                             |
| camera\_id                  | INTEGER         | NOT NULL, FK → cameras.id      |
| session\_id                 | INTEGER         | NOT NULL, FK → sessions.id     |
| file\_id                    | INTEGER         | FK → files.id                  |
| start\_time\_epoch\_us      | INTEGER         | NOT NULL                       |
| end\_time\_epoch\_us        | INTEGER         | NOT NULL                       |
| start\_pts\_us              | TEXT            | NOT NULL                       |
| end\_pts\_us                | TEXT            | NOT NULL                       |
| keyframe\_pts\_us           | TEXT            | NOT NULL                       |
| sequence\_start             | INTEGER         | —                              |
| sequence\_end               | INTEGER         | —                              |
| byte\_size                  | INTEGER         | NOT NULL                       |
| buffer\_count               | INTEGER         | NOT NULL                       |
| file\_offset                | INTEGER         | —                              |
| file\_length                | INTEGER         | —                              |
| complete                    | INTEGER         | NOT NULL, DEFAULT 1            |
| sequence\_gap\_count        | INTEGER         | NOT NULL, DEFAULT 0            |
| estimated\_missing\_buffers | INTEGER         | NOT NULL, DEFAULT 0            |

**Indexes:** idx\_gop\_file (file\_id); idx\_gop\_camera\_end
(camera\_id, end\_time\_epoch\_us); idx\_gop\_camera\_start (camera\_id,
start\_time\_epoch\_us)

### events

Generic ingestion/replay markers with ring context and
pre/post-roll.

| **Column**             | **SQLite type** | **Key / constraint / default**       |
| ---------------------- | --------------- | ------------------------------------ |
| id                     | INTEGER         | PK                                   |
| camera\_id             | INTEGER         | FK → cameras.id                      |
| ring                   | INTEGER         | —                                    |
| event\_time\_epoch\_us | INTEGER         | —                                    |
| pre\_roll\_ms          | INTEGER         | NOT NULL, DEFAULT 8000               |
| post\_roll\_ms         | INTEGER         | NOT NULL, DEFAULT 4000               |
| label                  | TEXT            | —                                    |
| notes                  | TEXT            | —                                    |
| ts                     | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| event\_type            | TEXT            | —                                    |
| message                | TEXT            | —                                    |
| created\_at            | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_events\_ring\_time (ring, event\_time\_epoch\_us)

## Configuration and testing

### configuration

Server configuration values stored as string key/value pairs.

| **Column**  | **SQLite type** | **Key / constraint / default** |
| ----------- | --------------- | ------------------------------ |
| id          | INTEGER         | PK                             |
| key         | TEXT            | NOT NULL                       |
| value       | TEXT            | —                              |
| description | TEXT            | —                              |

### test\_runs

Top-level execution record for an ingestion protocol test suite
run.

| **Column**             | **SQLite type** | **Key / constraint / default** |
| ---------------------- | --------------- | ------------------------------ |
| id                     | INTEGER         | PK                             |
| name                   | TEXT            | NOT NULL                       |
| started\_at            | TEXT            | NOT NULL                       |
| completed\_at          | TEXT            | —                              |
| status                 | TEXT            | NOT NULL                       |
| config\_snapshot\_json | TEXT            | —                              |
| notes                  | TEXT            | —                              |

### test\_results

Per-test outcome, measurements, observations, and
recommendations.

| **Column**         | **SQLite type** | **Key / constraint / default** |
| ------------------ | --------------- | ------------------------------ |
| id                 | INTEGER         | PK                             |
| test\_run\_id      | INTEGER         | NOT NULL, FK → test\_runs.id   |
| test\_id           | TEXT            | NOT NULL                       |
| category           | TEXT            | NOT NULL                       |
| name               | TEXT            | NOT NULL                       |
| description        | TEXT            | —                              |
| status             | TEXT            | NOT NULL                       |
| severity           | TEXT            | —                              |
| test\_type         | TEXT            | —                              |
| started\_at        | TEXT            | —                              |
| completed\_at      | TEXT            | —                              |
| duration\_ms       | INTEGER         | —                              |
| expected\_json     | TEXT            | —                              |
| actual\_json       | TEXT            | —                              |
| metrics\_json      | TEXT            | —                              |
| observations\_json | TEXT            | —                              |
| recommendation     | TEXT            | —                              |

**Indexes:** idx\_test\_results\_status (status);
idx\_test\_results\_category (category); idx\_test\_results\_test
(test\_id); idx\_test\_results\_run (test\_run\_id)

## IVR tournament and review

### ivr\_tournaments

Tournament-level container for rings, competitors, and scheduling
context.

| **Column**   | **SQLite type** | **Key / constraint / default**       |
| ------------ | --------------- | ------------------------------------ |
| id           | INTEGER         | PK                                   |
| external\_id | TEXT            | —                                    |
| name         | TEXT            | NOT NULL                             |
| venue        | TEXT            | —                                    |
| starts\_at   | TEXT            | —                                    |
| ends\_at     | TEXT            | —                                    |
| status       | TEXT            | NOT NULL, DEFAULT 'planned'          |
| notes        | TEXT            | —                                    |
| created\_at  | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at  | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_ivr\_tournaments\_status (status)

### ivr\_rings

Tournament ring definition and active-state
record.

| **Column**     | **SQLite type** | **Key / constraint / default**       |
| -------------- | --------------- | ------------------------------------ |
| id             | INTEGER         | PK                                   |
| tournament\_id | INTEGER         | NOT NULL, FK → ivr\_tournaments.id   |
| ring\_number   | INTEGER         | NOT NULL                             |
| name           | TEXT            | —                                    |
| active         | INTEGER         | NOT NULL, DEFAULT 1                  |
| created\_at    | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at    | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_ivr\_rings\_tournament (tournament\_id, ring\_number)

### ivr\_ring\_cameras

Many-to-many assignment of ingestion cameras to IVR rings, including
sync
offsets.

| **Column**       | **SQLite type** | **Key / constraint / default**       |
| ---------------- | --------------- | ------------------------------------ |
| ring\_id         | INTEGER         | PK, NOT NULL, FK → ivr\_rings.id     |
| camera\_id       | INTEGER         | PK, NOT NULL, FK → cameras.id        |
| display\_name    | TEXT            | —                                    |
| sync\_offset\_ms | INTEGER         | NOT NULL, DEFAULT 0                  |
| active           | INTEGER         | NOT NULL, DEFAULT 1                  |
| created\_at      | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at      | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_ivr\_ring\_cameras\_camera (camera\_id)

### ivr\_competitors

Tournament competitor/team
identity.

| **Column**     | **SQLite type** | **Key / constraint / default**       |
| -------------- | --------------- | ------------------------------------ |
| id             | INTEGER         | PK                                   |
| tournament\_id | INTEGER         | NOT NULL, FK → ivr\_tournaments.id   |
| external\_id   | TEXT            | —                                    |
| display\_name  | TEXT            | NOT NULL                             |
| team\_name     | TEXT            | —                                    |
| country\_code  | TEXT            | —                                    |
| created\_at    | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at    | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_ivr\_competitors\_tournament\_name (tournament\_id,
display\_name)

### ivr\_matches

Match identity, participants, officials, quotas, lifecycle, and
recording
boundary.

| **Column**                  | **SQLite type** | **Key / constraint / default**       |
| --------------------------- | --------------- | ------------------------------------ |
| id                          | INTEGER         | PK                                   |
| ring\_id                    | INTEGER         | NOT NULL, FK → ivr\_rings.id         |
| external\_id                | TEXT            | —                                    |
| match\_number               | TEXT            | NOT NULL                             |
| division                    | TEXT            | —                                    |
| stage                       | TEXT            | —                                    |
| round\_number               | INTEGER         | —                                    |
| referee                     | TEXT            | —                                    |
| review\_jury                | TEXT            | —                                    |
| chung\_competitor\_id       | INTEGER         | FK → ivr\_competitors.id             |
| hong\_competitor\_id        | INTEGER         | FK → ivr\_competitors.id             |
| chung\_quota                | INTEGER         | NOT NULL, DEFAULT 1                  |
| hong\_quota                 | INTEGER         | NOT NULL, DEFAULT 1                  |
| status                      | TEXT            | NOT NULL, DEFAULT 'scheduled'        |
| scheduled\_at               | TEXT            | —                                    |
| started\_at\_epoch\_us      | INTEGER         | —                                    |
| ended\_at\_epoch\_us        | INTEGER         | —                                    |
| recording\_start\_epoch\_us | INTEGER         | —                                    |
| created\_at                 | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at                 | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_ivr\_matches\_hong (hong\_competitor\_id);
idx\_ivr\_matches\_chung (chung\_competitor\_id);
idx\_ivr\_matches\_ring\_status (ring\_id, status)

### ivr\_review\_requests

Formal review request, review window, AUR marker, camera usage, and
workflow
state.

| **Column**               | **SQLite type** | **Key / constraint / default**       |
| ------------------------ | --------------- | ------------------------------------ |
| id                       | INTEGER         | PK                                   |
| public\_id               | TEXT            | NOT NULL                             |
| ring\_id                 | INTEGER         | NOT NULL, FK → ivr\_rings.id         |
| match\_id                | INTEGER         | FK → ivr\_matches.id                 |
| linked\_review\_id       | INTEGER         | FK → ivr\_review\_requests.id        |
| side                     | TEXT            | NOT NULL                             |
| origin                   | TEXT            | NOT NULL                             |
| issue\_type              | TEXT            | NOT NULL, DEFAULT 'standard'         |
| reason                   | TEXT            | —                                    |
| issues\_json             | TEXT            | NOT NULL, DEFAULT '\[\]'             |
| status                   | TEXT            | NOT NULL, DEFAULT 'pending'          |
| request\_mark\_epoch\_us | INTEGER         | NOT NULL                             |
| window\_start\_epoch\_us | INTEGER         | NOT NULL                             |
| window\_end\_epoch\_us   | INTEGER         | NOT NULL                             |
| review\_start\_epoch\_us | INTEGER         | —                                    |
| aur\_epoch\_us           | INTEGER         | —                                    |
| aur\_outside\_window     | INTEGER         | NOT NULL, DEFAULT 0                  |
| cameras\_available\_json | TEXT            | NOT NULL, DEFAULT '\[\]'             |
| cameras\_reviewed\_json  | TEXT            | NOT NULL, DEFAULT '\[\]'             |
| operator\_identity       | TEXT            | —                                    |
| created\_at              | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |
| updated\_at              | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP |

**Indexes:** idx\_ivr\_review\_requests\_window (ring\_id,
window\_start\_epoch\_us, window\_end\_epoch\_us);
idx\_ivr\_review\_requests\_match\_time (match\_id,
request\_mark\_epoch\_us); idx\_ivr\_review\_requests\_ring\_status
(ring\_id, status)

### ivr\_review\_decisions

One terminal disposition and quota outcome for a review
request.

| **Column**             | **SQLite type** | **Key / constraint / default**          |
| ---------------------- | --------------- | --------------------------------------- |
| id                     | INTEGER         | PK                                      |
| review\_request\_id    | INTEGER         | NOT NULL, FK → ivr\_review\_requests.id |
| result                 | TEXT            | NOT NULL                                |
| decided\_at\_epoch\_us | INTEGER         | NOT NULL                                |
| review\_duration\_ms   | INTEGER         | —                                       |
| quota\_outcome         | TEXT            | —                                       |
| recommendations        | TEXT            | —                                       |
| operator\_identity     | TEXT            | —                                       |
| created\_at            | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP    |
| updated\_at            | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP    |

**Indexes:** idx\_ivr\_review\_decisions\_time (decided\_at\_epoch\_us)

### ivr\_review\_annotations

One post-review explanatory annotation for a review
request.

| **Column**          | **SQLite type** | **Key / constraint / default**          |
| ------------------- | --------------- | --------------------------------------- |
| id                  | INTEGER         | PK                                      |
| review\_request\_id | INTEGER         | NOT NULL, FK → ivr\_review\_requests.id |
| review\_jury        | TEXT            | —                                       |
| reason              | TEXT            | —                                       |
| gam\_jeom\_type     | TEXT            | —                                       |
| explanation         | TEXT            | —                                       |
| notes               | TEXT            | —                                       |
| metadata\_json      | TEXT            | NOT NULL, DEFAULT '{}'                  |
| created\_at         | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP    |
| updated\_at         | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP    |

### ivr\_review\_audit\_events

Append-oriented audit trail for review workflow
actions.

| **Column**              | **SQLite type** | **Key / constraint / default**          |
| ----------------------- | --------------- | --------------------------------------- |
| id                      | INTEGER         | PK                                      |
| review\_request\_id     | INTEGER         | NOT NULL, FK → ivr\_review\_requests.id |
| event\_type             | TEXT            | NOT NULL                                |
| occurred\_at\_epoch\_us | INTEGER         | NOT NULL                                |
| actor\_identity         | TEXT            | —                                       |
| data\_json              | TEXT            | NOT NULL, DEFAULT '{}'                  |
| created\_at             | TEXT            | NOT NULL, DEFAULT CURRENT\_TIMESTAMP    |

**Indexes:** idx\_ivr\_review\_audit\_request\_time
(review\_request\_id,
occurred\_at\_epoch\_us)

# 6\. Current-state observations

| **Topic**              | **Current state and consequence**                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Compatibility columns  | cameras, sessions, and statistics retain both early-prototype and current names (for example ring\_no/ring, camera\_no/camera, start\_time/started\_at, bitrate/bitrate\_bps). This supports older databases but requires writers and reports to choose a canonical field set. |
| Time representation    | The schema mixes ISO-like TEXT timestamps with INTEGER epoch-microsecond values and PTS values stored as TEXT. This avoids integer/serialization issues in some paths but requires explicit conversion at API boundaries.                                                      |
| JSON columns           | Review issues, camera lists, annotations, and audit payloads are TEXT guarded by SQLite json\_valid(). Their internal object/array shapes are application contracts rather than normalized relational constraints.                                                             |
| State constraints      | IVR status/result/side/origin fields use CHECK constraints. Ingestion state fields are mostly unconstrained, providing compatibility at the cost of weaker database-level validation.                                                                                          |
| Review persistence gap | The persistence tables are present, but public/review/api/review.php still treats the PHP session as the live review store. Moving to the database requires transactional writes to requests, decisions, annotations, and audit events.                                        |
| Migration discipline   | Migrations are additive and embedded in application startup. A numbered migration ledger would make future constraint changes and production upgrades easier to audit and reproduce.                                                                                           |

# 7\. Source-of-truth notes

This reference was generated from deploy/db/schema.sql and cross-checked
against startup migration logic in src/freeplay.js and
public/review/includes/api-common.php. It documents repository-defined
structure, not the row contents or drift of a particular deployed
database. To verify a deployed instance, compare PRAGMA table\_info,
foreign\_key\_list, index\_list, and integrity\_check results against
this document.

# Application Flow

Sequence diagrams for the main interaction flows in the React/Node version.

Participants:

* **User** — browser interactions
* **Dashboard** — `Dashboard.jsx`, owns all state and `useEffect` hooks
* **API** — Express routes in `server/api/`
* **CSVLoader** — `server/csv-loader.js`, in-memory data cache


---

## 1. App Initialisation

Runs once on mount. Benchmarks are fetched, then the first benchmark is auto-selected, triggering the leaderboard and runs fetches in parallel.

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant API
    participant CSVLoader

    User->>Dashboard: open app
    Dashboard->>API: GET /api/benchmarks
    API->>CSVLoader: getAllBenchmarks()
    CSVLoader-->>API: benchmarks[]
    API-->>Dashboard: benchmarks[]
    Dashboard->>Dashboard: setSelectedBenchmark(benchmarks[0].id)

    par leaderboard + runs
        Dashboard->>API: GET /api/leaderboard?benchmark_id=X
        API->>CSVLoader: getLeaderboardByBenchmarkId(X)
        CSVLoader-->>API: leaderboard rows
        API-->>Dashboard: leaderboard[]
        Dashboard->>Dashboard: setLeaderboardData(...)

    and
        Dashboard->>API: GET /api/runs?benchmark_id=X
        API->>CSVLoader: getRunsByBenchmarkId(X)
        CSVLoader-->>API: runs[]
        API-->>Dashboard: runs[]
        Dashboard->>Dashboard: setRuns(...)
        Dashboard->>Dashboard: setSelectedRuns([runs[0].id])
    end

    Note over Dashboard: selectedRuns.length === 1 → confusion mode
```


---

## 2. Confusion Mode — Single Run Selected

Triggered whenever `selectedRuns` changes to exactly one run, or the `filter` toggle changes.

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant ConfusionMatrixPanel
    participant API
    participant CSVLoader

    User->>Dashboard: click leaderboard row (or checkbox)
    Dashboard->>Dashboard: setSelectedRuns([runId])

    par type matrix + all records
        Dashboard->>API: GET /api/confusion-matrix?run_id=R[&filter=incorrect]
        API->>CSVLoader: getConfusionMatrix(R, incorrectOnly)
        CSVLoader-->>API: type_matrix, subtype_matrix
        API-->>Dashboard: confusionMatrixData
        Dashboard->>Dashboard: setConfusionMatrixData(...)
        Dashboard->>Dashboard: reset selectedTypePair, selectedCell

    and
        Dashboard->>API: GET /api/records?run_id=R&limit=1000
        API->>CSVLoader: getRecords({run_id: R})
        CSVLoader-->>API: records[]
        API-->>Dashboard: recordsData
        Dashboard->>Dashboard: setAllRecordsData / setFilteredRecordsData
    end

    Dashboard->>ConfusionMatrixPanel: data, recordsData
    ConfusionMatrixPanel->>User: render Type Confusion Matrix + Record Details
```


---

## 3. Confusion Mode — Drill Down (Type → Subtype → Records)

```mermaid
sequenceDiagram
    participant User
    participant ConfusionMatrixPanel
    participant Dashboard
    participant API
    participant CSVLoader

    User->>ConfusionMatrixPanel: click type matrix cell [trueType, predType]
    ConfusionMatrixPanel->>Dashboard: onCellClick(trueType, predType)
    Dashboard->>Dashboard: setSelectedTypePair({true, pred})

    par subtype matrix + filtered records
        Dashboard->>API: GET /api/confusion-matrix/subtype?run_id=R&true_type=T&pred_type=P
        API->>CSVLoader: getSubtypeMatrixForTypePair(R, T, P)
        CSVLoader-->>API: subtype matrix
        API-->>Dashboard: subtypeMatrixData
        Dashboard->>Dashboard: setSubtypeMatrixData(...)

    and
        Dashboard->>API: GET /api/records?run_id=R&true_type=T&pred_type=P&limit=1000
        API->>CSVLoader: getRecords({run_id, true_type, pred_type})
        CSVLoader-->>API: filtered records[]
        API-->>Dashboard: filteredRecordsData
        Dashboard->>Dashboard: setFilteredRecordsData(...)
    end

    Dashboard->>ConfusionMatrixPanel: subtypeMatrixData, filteredRecordsData
    ConfusionMatrixPanel->>User: render Subtype Matrix + filtered Record Details

    User->>ConfusionMatrixPanel: click subtype matrix cell [trueSub, predSub]
    ConfusionMatrixPanel->>Dashboard: onSubtypeCellClick(trueSub, predSub)
    Dashboard->>Dashboard: setSelectedSubtypePair({true_subtype, pred_subtype})

    Dashboard->>API: GET /api/records?run_id=R&true_type=T&pred_type=P&true_subtype=TS&pred_subtype=PS&limit=1000
    API->>CSVLoader: getRecords({...subtypeFilters})
    CSVLoader-->>API: records[]
    API-->>Dashboard: filteredRecordsData
    Dashboard->>Dashboard: setFilteredRecordsData(...)
    Dashboard->>ConfusionMatrixPanel: filteredRecordsData
    ConfusionMatrixPanel->>User: Record Details filtered to that subtype cell
```


---

## 4. Transition Mode — Two Runs Selected

Triggered when `selectedRuns.length === 2`.

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant TransitionMatrixPanel
    participant API
    participant CSVLoader

    User->>Dashboard: check second run checkbox
    Dashboard->>Dashboard: setSelectedRuns([runId1, runId2])

    par transition matrix + all records
        Dashboard->>API: GET /api/transition-matrix?run_id1=R1&run_id2=R2&min_count=N
        API->>CSVLoader: getTransitionMatrix(R1, R2, minCount)
        Note over CSVLoader: join by request_id, keep only changed subtypes,<br/>compute run1Correct/run2Correct/bothWrong per cell
        CSVLoader-->>API: rows, cols, data
        API-->>Dashboard: transitionMatrixData
        Dashboard->>Dashboard: setTransitionMatrixData(...)

    and
        Dashboard->>API: GET /api/records?run_id1=R1&run_id2=R2&limit=1000
        API->>CSVLoader: getRecords({run_id1, run_id2})
        Note over CSVLoader: join R1+R2 by request_id,<br/>keep only records where pred_subtype differs
        CSVLoader-->>API: combined records[]
        API-->>Dashboard: allRecordsData
        Dashboard->>Dashboard: setAllRecordsData / setFilteredRecordsData
    end

    Dashboard->>TransitionMatrixPanel: data, recordsData, selectedRunNames
    TransitionMatrixPanel->>User: render Transition Matrix + Record Details
```


---

## 5. Transition Mode — Cell Click Filters Records

```mermaid
sequenceDiagram
    participant User
    participant TransitionMatrixPanel
    participant Dashboard
    participant API
    participant CSVLoader

    User->>TransitionMatrixPanel: click matrix cell [run1Pred, run2Pred]
    TransitionMatrixPanel->>Dashboard: onCellClick(run1Pred, run2Pred)
    Dashboard->>Dashboard: setSelectedCell({run1, run2})

    Dashboard->>API: GET /api/records?run_id1=R1&run_id2=R2&run1_pred_subtype=S1&run2_pred_subtype=S2&limit=1000
    API->>CSVLoader: getRecords({run_id1, run_id2, run1_pred_subtype, run2_pred_subtype})
    CSVLoader-->>API: filtered records[]
    API-->>Dashboard: filteredRecordsData
    Dashboard->>Dashboard: setFilteredRecordsData(...)

    Dashboard->>TransitionMatrixPanel: filteredRecordsData
    TransitionMatrixPanel->>User: Record Details filtered to that transition cell
```


---

## 6. Benchmark Switch

Resets all analysis state and restarts from the leaderboard.

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant API
    participant CSVLoader

    User->>Dashboard: click benchmark button
    Dashboard->>Dashboard: setSelectedBenchmark(newId)
    Dashboard->>Dashboard: reset selectedRuns, selectedCell,<br/>selectedTypePair, selectedSubtypePair

    par
        Dashboard->>API: GET /api/leaderboard?benchmark_id=newId
        API->>CSVLoader: getLeaderboardByBenchmarkId(newId)
        CSVLoader-->>API: leaderboard[]
        API-->>Dashboard: leaderboard[]
        Dashboard->>Dashboard: setLeaderboardData(...)

    and
        Dashboard->>API: GET /api/runs?benchmark_id=newId
        API->>CSVLoader: getRunsByBenchmarkId(newId)
        CSVLoader-->>API: runs[]
        API-->>Dashboard: runs[]
        Dashboard->>Dashboard: setRuns(...)
    end
```


---

## 7. Incorrect-Only Filter Toggle

Only available in confusion mode. Refreshes the type matrix, subtype matrix (if a type pair is selected), and records.

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant API
    participant CSVLoader

    User->>Dashboard: toggle "Incorrect Only"
    Dashboard->>Dashboard: setFilter('incorrect') [or 'all']

    par type matrix refresh
        Dashboard->>API: GET /api/confusion-matrix?run_id=R&filter=incorrect
        API->>CSVLoader: getConfusionMatrix(R, incorrectOnly=true)
        CSVLoader-->>API: filtered type_matrix
        API-->>Dashboard: confusionMatrixData
        Dashboard->>Dashboard: setConfusionMatrixData(...)
        Dashboard->>Dashboard: reset selectedTypePair, selectedCell

    and records refresh
        Dashboard->>API: GET /api/records?run_id=R&filter=incorrect&limit=1000
        API->>CSVLoader: getRecords({run_id, incorrectOnly: true})
        CSVLoader-->>API: records[]
        API-->>Dashboard: filteredRecordsData
        Dashboard->>Dashboard: setFilteredRecordsData(...)
    end

    Note over Dashboard: if selectedTypePair was set,<br/>subtype matrix is also re-fetched automatically<br/>(selectedTypePair + filter are both useEffect deps)
```



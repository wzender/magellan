import React, { useState } from 'react';

function RowLevelTable({ data }) {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(0);

  if (!data || !data.data) return <div>No records</div>;

  const PAGE_SIZE = 10;
  const pageData = data.data.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(data.data.length / PAGE_SIZE);

  const toggleExpand = id => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const renderJsonPreview = obj => {
    const str = JSON.stringify(obj).substring(0, 100);
    return str.length > 100 ? str + '...' : str;
  };

  return (
    <div className="row-level-table-panel">
      <h3>Record Details ({data.pagination.total} total)</h3>
      <div className="table-wrapper">
        <table className="records-table">
          <thead>
            <tr>
              <th>Request ID</th>
              <th>True Type</th>
              <th>Pred Type</th>
              <th>True Subtype</th>
              <th>Pred Subtype</th>
              <th>Attributes</th>
              <th>Metadata</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map(record => (
              <React.Fragment key={record.id}>
                <tr className={`record-row ${expandedRows.has(record.id) ? 'expanded' : ''}`}>
                  <td>{record.request_id}</td>
                  <td>{record.true_type}</td>
                  <td>{record.pred_type}</td>
                  <td>{record.true_subtype}</td>
                  <td>{record.pred_subtype}</td>
                  <td>
                    <button
                      className="expand-button"
                      onClick={() => toggleExpand(record.id)}
                    >
                      {expandedRows.has(record.id) ? '▼' : '▶'} Expand
                    </button>
                  </td>
                  <td>
                    <span className="json-preview">
                      {renderJsonPreview(record.metadata)}
                    </span>
                  </td>
                </tr>
                {expandedRows.has(record.id) && (
                  <tr className="expanded-row">
                    <td colSpan="7">
                      <div className="expanded-content">
                        <div className="json-section">
                          <h4>Attributes:</h4>
                          <pre>{JSON.stringify(record.attributes, null, 2)}</pre>
                        </div>
                        <div className="json-section">
                          <h4>Metadata:</h4>
                          <pre>{JSON.stringify(record.metadata, null, 2)}</pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <button
          onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
          disabled={currentPage === 0}
        >
          Previous
        </button>
        <span>
          Page {currentPage + 1} of {totalPages}
        </span>
        <button
          onClick={() => setCurrentPage(Math.min(totalPages - 1, currentPage + 1))}
          disabled={currentPage === totalPages - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default RowLevelTable;

import React from 'react';
import ReactDOM from 'react-dom';
import Dashboard from './components/Dashboard';
import './components/styles.css';

/**
 * Frontend Entry Point
 * Mounts React Dashboard component to DOM
 */

ReactDOM.render(
  <React.StrictMode>
    <Dashboard />
  </React.StrictMode>,
  document.getElementById('root')
);
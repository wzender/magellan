/**
 * Frontend Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Dashboard from '../Dashboard';
import LeaderboardWidget from '../LeaderboardWidget';
import ConfusionMatrixPanel from '../ConfusionMatrixPanel';

// Mock fetch globally
global.fetch = jest.fn();

describe('Dashboard Component', () => {
  beforeEach(() => {
    fetch.mockClear();
  });

  test('renders dashboard header', () => {
    fetch.mockResolvedValueOnce({
      json: async () => [],
    });

    render(<Dashboard />);
    expect(screen.getByText('Classification Evaluation & Analysis System')).toBeInTheDocument();
  });

  test('loads benchmarks on mount', async () => {
    const mockBenchmarks = [
      { id: 1, name: 'Benchmark Q1' },
      { id: 2, name: 'Benchmark Q2' },
    ];

    fetch.mockResolvedValueOnce({
      json: async () => mockBenchmarks,
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/benchmarks');
    });
  });

  test('loads runs when benchmark is selected', async () => {
    const mockBenchmarks = [{ id: 1, name: 'Benchmark Q1' }];
    const mockRuns = [{ id: 1, run_name: 'model_v1', model_version: '1.0.0' }];

    fetch
      .mockResolvedValueOnce({
        json: async () => mockBenchmarks,
      })
      .mockResolvedValueOnce({
        json: async () => mockRuns,
      });

    render(<Dashboard />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/runs?benchmark_id=1');
    });
  });
});

describe('LeaderboardWidget Component', () => {
  test('renders leaderboard table', () => {
    const mockData = [
      {
        run_id: 1,
        run_name: 'model_v1',
        model_version: '1.0.0',
        subtype_weighted_f1: 0.84,
        type_weighted_f1: 0.92,
        benchmark_length: 2000,
      },
    ];

    render(<LeaderboardWidget data={mockData} />);

    expect(screen.getByText('Leaderboard')).toBeInTheDocument();
    expect(screen.getByText('model_v1')).toBeInTheDocument();
  });

  test('renders empty state when no data', () => {
    render(<LeaderboardWidget data={[]} />);
    expect(screen.getByText('No leaderboard data available')).toBeInTheDocument();
  });
});

describe('ConfusionMatrixPanel Component', () => {
  test('renders confusion matrix', () => {
    const mockData = {
      type_matrix: {
        rows: ['Product', 'Service'],
        cols: ['Product', 'Service'],
        data: {
          Product: { Product: 150, Service: 10 },
          Service: { Product: 5, Service: 95 },
        },
      },
      subtype_matrix: {
        data: [],
      },
    };

    render(
      <ConfusionMatrixPanel
        data={mockData}
        selectedCell={null}
        onCellClick={jest.fn()}
        loading={false}
      />
    );

    expect(screen.getByText('Type Confusion Matrix')).toBeInTheDocument();
  });

  test('handles cell click', () => {
    const mockData = {
      type_matrix: {
        rows: ['Product'],
        cols: ['Product'],
        data: { Product: { Product: 150 } },
      },
      subtype_matrix: { data: [] },
    };

    const onCellClick = jest.fn();

    render(
      <ConfusionMatrixPanel
        data={mockData}
        selectedCell={null}
        onCellClick={onCellClick}
        loading={false}
      />
    );

    // Click on a matrix cell
    const cells = screen.getAllByText('150');
    fireEvent.click(cells[0]);

    expect(onCellClick).toHaveBeenCalled();
  });
});

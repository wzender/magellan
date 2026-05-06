/**
 * Backend Tests for API Endpoints
 */

const request = require('supertest');
const app = require('../../index');
const { query } = require('../../db');

// Mock database queries
jest.mock('../../db');

describe('API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Leaderboard Endpoints', () => {
    test('GET /leaderboard should return leaderboard metrics', async () => {
      const mockData = [
        {
          run_id: 1,
          run_name: 'model_v1',
          model_version: '1.0.0',
          benchmark_length: 2000,
          subtype_weighted_f1: '0.8400',
          type_weighted_f1: '0.9200',
        },
      ];

      query.mockResolvedValueOnce({ rows: mockData });

      const response = await request(app).get('/api/leaderboard?benchmark_id=1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockData);
    });

    test('GET /leaderboard without benchmark_id should return error', async () => {
      const response = await request(app).get('/api/leaderboard');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('GET /leaderboard/benchmarks should return all benchmarks', async () => {
      const mockBenchmarks = [
        { id: 1, name: 'Benchmark Q1', created_at: new Date() },
        { id: 2, name: 'Benchmark Q2', created_at: new Date() },
      ];

      query.mockResolvedValueOnce({ rows: mockBenchmarks });

      const response = await request(app).get('/api/benchmarks');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockBenchmarks);
    });
  });

  describe('Runs Endpoints', () => {
    test('GET /runs should return runs for benchmark', async () => {
      const mockRuns = [
        { id: 1, run_name: 'model_v1', model_version: '1.0.0', created_at: new Date() },
        { id: 2, run_name: 'model_v2', model_version: '1.1.0', created_at: new Date() },
      ];

      query.mockResolvedValueOnce({ rows: mockRuns });

      const response = await request(app).get('/api/runs?benchmark_id=1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRuns);
    });

    test('GET /runs/:id should return specific run', async () => {
      const mockRun = {
        id: 1,
        run_name: 'model_v1',
        model_version: '1.0.0',
        benchmark_id: 1,
        benchmark_name: 'Test Benchmark',
        record_count: '2000',
        created_at: new Date(),
      };

      query.mockResolvedValueOnce({ rows: [mockRun] });

      const response = await request(app).get('/api/runs/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockRun);
    });
  });

  describe('Confusion Matrix Endpoints', () => {
    test('GET /confusion-matrix should return confusion matrices', async () => {
      const mockTypeResult = [
        { true_type: 'Product', pred_type: 'Product', count: 150 },
        { true_type: 'Product', pred_type: 'Service', count: 10 },
      ];

      query.mockResolvedValueOnce({ rows: mockTypeResult });
      query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app).get('/api/confusion-matrix?run_id=1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type_matrix');
      expect(response.body).toHaveProperty('subtype_matrix');
    });
  });

  describe('Records Endpoints', () => {
    test('GET /records should return paginated records', async () => {
      const mockRecords = [
        {
          id: 1,
          request_id: 'REC-000001',
          true_type: 'Product',
          pred_type: 'Product',
          true_subtype: 'Physical',
          pred_subtype: 'Physical',
        },
      ];

      query.mockResolvedValueOnce({ rows: [{ total: 100 }] });
      query.mockResolvedValueOnce({ rows: mockRecords });

      const response = await request(app).get('/api/records?run_id=1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });
  });
});

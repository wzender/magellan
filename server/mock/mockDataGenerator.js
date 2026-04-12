/**
 * Mock Data Generator for Classification Evaluation & Analysis System
 * Generates realistic test data with ~2,000 items per benchmark,
 * 20 types with 10-20 subtypes each, and realistic attributes
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate a realistic taxonomy with 20 types and 10-20 subtypes per type
 */
function generateTaxonomy() {
  const types = [
    'Product', 'Service', 'Transaction', 'User', 'Content',
    'Account', 'Payment', 'Shipping', 'Return', 'Complaint',
    'Feedback', 'Support', 'Marketing', 'Event', 'Document',
    'Communication', 'Alert', 'System', 'Security', 'Analytics'
  ];

  const subtypeMap = {
    'Product': ['Physical', 'Digital', 'Subscription', 'Bundle', 'Rental', 'Gift', 'Clearance', 'Limited', 'Exclusive', 'Licensed', 'Custom', 'Refurbished'],
    'Service': ['Delivery', 'Installation', 'Support', 'Consultation', 'Maintenance', 'Training', 'Premium', 'Standard', 'Express', 'Onsite', 'Remote', 'Phone'],
    'Transaction': ['Purchase', 'Refund', 'Exchange', 'Warranty', 'Insurance', 'Discount', 'Promotion', 'Coupon', 'Bulk', 'Contract', 'Subscription', 'Trial'],
    'User': ['Customer', 'Vendor', 'Admin', 'Guest', 'Premium', 'Free', 'Corporate', 'Individual', 'Partner', 'Influencer', 'Internal', 'Inactive'],
    'Content': ['Text', 'Image', 'Video', 'Audio', 'Document', 'Spreadsheet', 'Presentation', 'Code', 'Dataset', 'Archive', 'Webpage', 'Comment'],
    'Account': ['Premium', 'Standard', 'Enterprise', 'Developer', 'Education', 'Nonprofit', 'Government', 'Startup', 'Trial', 'Suspended', 'Verified', 'Unverified'],
    'Payment': ['Credit Card', 'Debit Card', 'Bank Transfer', 'Digital Wallet', 'Cryptocurrency', 'Check', 'Cash', 'Invoice', 'Subscription', 'Prepaid', 'COD', 'Gift Card'],
    'Shipping': ['Standard', 'Express', 'Overnight', 'International', 'Fragile', 'Hazmat', 'Temperature Controlled', 'Insured', 'Signature', 'Self Pickup', 'Drop Off', 'White Glove'],
    'Return': ['Defective', 'Wrong Item', 'Not As Described', 'Changed Mind', 'Damaged in Transit', 'Partial', 'Full', 'Expired', 'Recall', 'Duplicate', 'Unwanted', 'Incompatible'],
    'Complaint': ['Quality', 'Service', 'Delivery', 'Pricing', 'Billing', 'Support', 'Safety', 'Privacy', 'Communication', 'Misrepresentation', 'Discriminatory', 'Fraud'],
    'Feedback': ['Positive', 'Negative', 'Neutral', 'Suggestion', 'Bug Report', 'Feature Request', 'Review', 'Rating', 'Testimonial', 'Improvement', 'Comment', 'Question'],
    'Support': ['Chat', 'Email', 'Phone', 'Ticket', 'FAQ', 'Knowledge Base', 'Video Tutorial', 'Community', 'Escalation', 'Callback', 'Social Media', 'In Person'],
    'Marketing': ['Email Campaign', 'Social Media', 'Paid Ads', 'Influencer', 'Affiliate', 'Content', 'Partnership', 'Event', 'Referral', 'PR', 'Direct Mail', 'Webinar'],
    'Event': ['Conference', 'Webinar', 'Workshop', 'Meetup', 'Launch', 'Sponsored', 'Virtual', 'In Person', 'Hybrid', 'Private', 'Public', 'Exclusive'],
    'Document': ['Invoice', 'Receipt', 'Shipping Label', 'Contract', 'Policy', 'Terms', 'Manual', 'Guide', 'Report', 'Certificate', 'License', 'Warranty'],
    'Communication': ['Email', 'SMS', 'Push Notification', 'In App Message', 'WhatsApp', 'Phone Call', 'Video Call', 'Chat', 'Forum', 'Blog', 'Newsletter', 'Alert'],
    'Alert': ['Warning', 'Error', 'Info', 'Success', 'Debug', 'Security', 'Performance', 'Maintenance', 'Status', 'Reminder', 'Urgent', 'Notification'],
    'System': ['Database', 'Server', 'Network', 'Storage', 'Security', 'Backup', 'Cache', 'Queue', 'Load Balancer', 'Monitoring', 'Logging', 'Authentication'],
    'Security': ['Login', 'Password', 'Encryption', 'Permission', 'Role', 'Access Control', 'Audit', 'Vulnerability', 'Patch', 'Firewall', 'VPN', 'SSL'],
    'Analytics': ['Pageview', 'Click', 'Conversion', 'Session', 'User', 'Cohort', 'Funnel', 'Retention', 'Attribution', 'Revenue', 'Traffic', 'Engagement']
  };

  return { types, subtypeMap };
}

/**
 * Generate realistic item attributes as large JSON objects
 */
function generateAttributes() {
  const adjectives = ['red', 'blue', 'large', 'small', 'premium', 'standard', 'deluxe', 'basic', 'professional', 'consumer'];
  const categories = ['electronics', 'clothing', 'furniture', 'food', 'books', 'toys', 'sports', 'music', 'art', 'home'];
  const brands = ['BrandA', 'BrandB', 'BrandC', 'BrandD', 'BrandE', 'Generic', 'Premium', 'Store Brand', 'Luxury', 'Budget'];

  return {
    name: `Item_${Math.random().toString(36).substring(7)}`,
    description: `A ${adjectives[Math.floor(Math.random() * adjectives.length)]} ${categories[Math.floor(Math.random() * categories.length)]} product`,
    brand: brands[Math.floor(Math.random() * brands.length)],
    price: Math.round(Math.random() * 10000) / 100,
    rating: (Math.random() * 5).toFixed(1),
    inventory: Math.floor(Math.random() * 1000),
    color: adjectives[Math.floor(Math.random() * adjectives.length)],
    size: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size'][Math.floor(Math.random() * 7)],
    material: ['Cotton', 'Polyester', 'Wool', 'Silk', 'Nylon', 'Leather', 'Metal', 'Plastic', 'Wood', 'Glass'][Math.floor(Math.random() * 10)],
    weight: Math.round(Math.random() * 10000) / 100,
    dimensions: {
      length: Math.round(Math.random() * 500),
      width: Math.round(Math.random() * 500),
      height: Math.round(Math.random() * 500)
    },
    tags: Array.from({ length: Math.floor(Math.random() * 5) + 1 }, () =>
      categories[Math.floor(Math.random() * categories.length)]
    ),
    sku: `SKU-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    upc: `${Math.floor(Math.random() * 1000000000000)}`,
    createdDate: new Date(Date.now() - Math.random() * 31536000000).toISOString(),
    lastModified: new Date(Date.now() - Math.random() * 2592000000).toISOString(),
  };
}

/**
 * Generate realistic metadata
 */
function generateMetadata() {
  return {
    source: ['API', 'Manual Entry', 'Import', 'Web Scrape', 'User Submission'][Math.floor(Math.random() * 5)],
    verified: Math.random() > 0.5,
    confidence: (Math.random() * 100).toFixed(2),
    lastChecked: new Date(Date.now() - Math.random() * 2592000000).toISOString(),
    dataQuality: ['High', 'Medium', 'Low'][Math.floor(Math.random() * 3)],
    region: ['US', 'EU', 'APAC', 'LATAM', 'MENA'][Math.floor(Math.random() * 5)],
    department: ['Sales', 'Marketing', 'Operations', 'Finance', 'Support'][Math.floor(Math.random() * 5)],
    status: ['Active', 'Inactive', 'Archived', 'Pending', 'Review'][Math.floor(Math.random() * 5)],
  };
}

/**
 * Generate a confusion pattern (realistic classification errors)
 * Some classes are more commonly confused with each other
 */
function getConfusionPattern(types) {
  // Create a pattern where certain types are more likely to be confused
  const confusionMap = {};
  types.forEach((type, idx) => {
    confusionMap[type] = types[idx]; // Default: correct
    if (Math.random() < 0.15) { // 15% error rate
      const otherTypesIdx = Array.from({ length: types.length }, (_, i) => i)
        .filter(i => i !== idx)
        .sort(() => Math.random() - 0.5)
        .slice(0, 3);
      confusionMap[type] = types[otherTypesIdx[0]];
    }
  });
  return confusionMap;
}

/**
 * Generate a single benchmark dataset
 */
function generateBenchmarkData(taxonomy, numRecords = 2000) {
  const { types, subtypeMap } = taxonomy;
  const records = [];
  const confusionPattern = getConfusionPattern(types);

  for (let i = 0; i < numRecords; i++) {
    const trueType = types[Math.floor(Math.random() * types.length)];
    const trueSubtype = subtypeMap[trueType][Math.floor(Math.random() * subtypeMap[trueType].length)];

    // Prediction: sometimes correct, sometimes confused
    let predType = confusionPattern[trueType];
    let predSubtype = subtypeMap[predType][Math.floor(Math.random() * subtypeMap[predType].length)];

    // Add some random errors to subtypes
    if (Math.random() < 0.12 && subtypeMap[predType].length > 1) {
      const randomSubIdx = Math.floor(Math.random() * subtypeMap[predType].length);
      predSubtype = subtypeMap[predType][randomSubIdx];
    }

    records.push({
      request_id: `REC-${String(i + 1).padStart(6, '0')}`,
      attributes: generateAttributes(),
      metadata: generateMetadata(),
      true_type: trueType,
      pred_type: predType,
      true_subtype: trueSubtype,
      pred_subtype: predSubtype,
    });
  }

  return records;
}

/**
 * Generate variation of predictions for a record to create transitions
 * Keeps base record but modifies predictions
 */
function generateTransitionVariant(record, subtypeMap, variationStrength = 0.3) {
  const variant = { ...record };

  // Occasionally change the prediction (based on variationStrength)
  if (Math.random() < variationStrength) {
    const types = Object.keys(subtypeMap);
    variant.pred_type = types[Math.floor(Math.random() * types.length)];
    variant.pred_subtype = subtypeMap[variant.pred_type][Math.floor(Math.random() * subtypeMap[variant.pred_type].length)];
  }

  return variant;
}

/**
 * Calculate leaderboard metrics from results
 */
function calculateMetrics(records) {
  let correctSubtype = 0;
  let correctType = 0;

  records.forEach(record => {
    if (record.true_subtype === record.pred_subtype) correctSubtype++;
    if (record.true_type === record.pred_type) correctType++;
  });

  // For weighted F1, we need per-class metrics
  const typeMetrics = {};
  const subtypeMetrics = {};

  records.forEach(record => {
    const tType = record.true_type;
    const pType = record.pred_type;
    const tSubtype = record.true_subtype;
    const pSubtype = record.pred_subtype;

    if (!typeMetrics[tType]) {
      typeMetrics[tType] = { tp: 0, total: 0 };
    }
    typeMetrics[tType].total++;
    if (tType === pType) typeMetrics[tType].tp++;

    if (!subtypeMetrics[tSubtype]) {
      subtypeMetrics[tSubtype] = { tp: 0, total: 0 };
    }
    subtypeMetrics[tSubtype].total++;
    if (tSubtype === pSubtype) subtypeMetrics[tSubtype].tp++;
  });

  // Calculate weighted F1
  let typeWeightedF1 = 0;
  let subtypeWeightedF1 = 0;

  Object.values(typeMetrics).forEach(m => {
    const precision = m.tp / (m.total > 0 ? m.total : 1);
    typeWeightedF1 += (precision * m.total) / records.length;
  });

  Object.values(subtypeMetrics).forEach(m => {
    const precision = m.tp / (m.total > 0 ? m.total : 1);
    subtypeWeightedF1 += (precision * m.total) / records.length;
  });

  return {
    subtype_accuracy: (correctSubtype / records.length).toFixed(4),
    subtype_f1_weighted: Math.min(subtypeWeightedF1, 1).toFixed(4), // Cap at 1.0
    type_f1_weighted: Math.min(typeWeightedF1, 1).toFixed(4),
    benchmark_length: records.length,
  };
}

/**
 * Main export for use as a module or direct execution
 */
function generateMockData() {
  const taxonomy = generateTaxonomy();
  const benchmarkData = {
    benchmark_name: 'Test Benchmark',
    records: generateBenchmarkData(taxonomy, 2000),
  };

  const metrics = calculateMetrics(benchmarkData.records);
  benchmarkData.metrics = metrics;

  return benchmarkData;
}

// If run directly, generate and output data
if (require.main === module) {
  const data = generateMockData();
  console.log('Generated mock data with structure:');
  console.log(JSON.stringify({
    benchmark_name: data.benchmark_name,
    num_records: data.records.length,
    sample_record: data.records[0],
    metrics: data.metrics,
  }, null, 2));
}

module.exports = {
  generateMockData,
  generateTaxonomy,
  generateBenchmarkData,
  calculateMetrics,
  generateAttributes,
  generateMetadata,
  generateTransitionVariant,
};

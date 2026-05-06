#!/usr/bin/env python3
"""Rename Unknowns runs to country names, translate attributes, create Italy run, write subtypes-by-country.json."""
import csv, json, os, shutil

DATA_DIR = os.path.dirname(__file__)
RUNS_DIR = os.path.join(DATA_DIR, 'runs')

# ── Country/subtype data (mirrors create_subtypes_xlsx.py) ───────────────────

COUNTRY_BY_TYPE = {
    'Account':       ['Spain', 'France', 'Italy'],
    'Alert':         ['Italy'],
    'Analytics':     ['France', 'Italy'],
    'Communication': ['France'],
    'Complaint':     ['Spain', 'Italy'],
    'Content':       ['France'],
    'Document':      ['Spain', 'Italy'],
    'Event':         ['Spain', 'France'],
    'Feedback':      ['Spain', 'France', 'Italy'],
    'Marketing':     ['France'],
    'Payment':       ['Spain'],
    'Product':       ['Spain', 'France'],
    'Return':        ['Spain'],
    'Security':      ['Italy'],
    'Service':       ['Spain', 'France', 'Italy'],
    'Shipping':      ['Spain'],
    'Support':       ['Spain', 'France', 'Italy'],
    'System':        ['Italy'],
    'Transaction':   ['Spain', 'France', 'Italy'],
    'User':          ['Spain', 'France', 'Italy'],
}

SUBTYPES_BY_TYPE = {
    'Account':       ['Developer', 'Education', 'Enterprise', 'Government', 'Nonprofit',
                      'Premium', 'Standard', 'Startup', 'Suspended', 'Trial', 'Unverified', 'Verified'],
    'Alert':         ['Debug', 'Error', 'Info', 'Maintenance', 'Notification', 'Performance',
                      'Reminder', 'Security', 'Status', 'Success', 'Urgent', 'Warning'],
    'Analytics':     ['Attribution', 'Click', 'Cohort', 'Conversion', 'Engagement', 'Funnel',
                      'Pageview', 'Retention', 'Revenue', 'Session', 'Traffic', 'User'],
    'Communication': ['Alert', 'Blog', 'Chat', 'Email', 'Forum', 'In App Message',
                      'Newsletter', 'Phone Call', 'Push Notification', 'SMS', 'Video Call', 'WhatsApp'],
    'Complaint':     ['Billing', 'Communication', 'Delivery', 'Discriminatory', 'Fraud',
                      'Misrepresentation', 'Pricing', 'Privacy', 'Quality', 'Safety', 'Service', 'Support'],
    'Content':       ['Archive', 'Audio', 'Code', 'Comment', 'Dataset', 'Document',
                      'Image', 'Presentation', 'Spreadsheet', 'Text', 'Video', 'Webpage'],
    'Document':      ['Certificate', 'Contract', 'Guide', 'Invoice', 'License', 'Manual',
                      'Policy', 'Receipt', 'Report', 'Shipping Label', 'Terms', 'Warranty'],
    'Event':         ['Conference', 'Exclusive', 'Hybrid', 'In Person', 'Launch', 'Meetup',
                      'Private', 'Public', 'Sponsored', 'Virtual', 'Webinar', 'Workshop'],
    'Feedback':      ['Bug Report', 'Comment', 'Feature Request', 'Improvement', 'Negative',
                      'Neutral', 'Positive', 'Question', 'Rating', 'Review', 'Suggestion', 'Testimonial'],
    'Marketing':     ['Affiliate', 'Content', 'Direct Mail', 'Email Campaign', 'Event',
                      'Influencer', 'Paid Ads', 'Partnership', 'PR', 'Referral', 'Social Media', 'Webinar'],
    'Payment':       ['Bank Transfer', 'Cash', 'Check', 'COD', 'Credit Card', 'Cryptocurrency',
                      'Debit Card', 'Digital Wallet', 'Gift Card', 'Invoice', 'Prepaid', 'Subscription'],
    'Product':       ['Bundle', 'Clearance', 'Custom', 'Digital', 'Exclusive', 'Gift',
                      'Licensed', 'Limited', 'Physical', 'Refurbished', 'Rental', 'Subscription'],
    'Return':        ['Changed Mind', 'Damaged in Transit', 'Defective', 'Duplicate', 'Expired',
                      'Full', 'Incompatible', 'Not As Described', 'Partial', 'Recall', 'Unwanted', 'Wrong Item'],
    'Security':      ['Access Control', 'Audit', 'Encryption', 'Firewall', 'Login', 'Password',
                      'Patch', 'Permission', 'Role', 'SSL', 'VPN', 'Vulnerability'],
    'Service':       ['Consultation', 'Delivery', 'Express', 'Installation', 'Maintenance',
                      'Onsite', 'Phone', 'Premium', 'Remote', 'Standard', 'Support', 'Training'],
    'Shipping':      ['Drop Off', 'Express', 'Fragile', 'Hazmat', 'Insured', 'International',
                      'Overnight', 'Self Pickup', 'Signature', 'Standard', 'Temperature Controlled', 'White Glove'],
    'Support':       ['Callback', 'Chat', 'Community', 'Email', 'Escalation', 'FAQ',
                      'In Person', 'Knowledge Base', 'Phone', 'Social Media', 'Ticket', 'Video Tutorial'],
    'System':        ['Authentication', 'Backup', 'Cache', 'Database', 'Load Balancer', 'Logging',
                      'Monitoring', 'Network', 'Queue', 'Security', 'Server', 'Storage'],
    'Transaction':   ['Bulk', 'Contract', 'Coupon', 'Discount', 'Exchange', 'Insurance',
                      'Promotion', 'Purchase', 'Refund', 'Subscription', 'Trial', 'Warranty'],
    'User':          ['Admin', 'Corporate', 'Customer', 'Free', 'Guest', 'Inactive',
                      'Individual', 'Influencer', 'Internal', 'Partner', 'Premium', 'Vendor'],
}

def subtypes_for_country(country):
    result = []
    for type_name in sorted(SUBTYPES_BY_TYPE):
        if country in COUNTRY_BY_TYPE.get(type_name, []):
            result.extend(SUBTYPES_BY_TYPE[type_name])
    return sorted(set(result))

# ── Translation tables (reused from translate_data.py) ───────────────────────

TAGS = {
    'es': {'music':'música','food':'comida','toys':'juguetes','clothing':'ropa',
           'furniture':'muebles','art':'arte','sports':'deportes','books':'libros',
           'home':'hogar','electronics':'electrónica'},
    'fr': {'music':'musique','food':'nourriture','toys':'jouets','clothing':'vêtements',
           'furniture':'meubles','art':'art','sports':'sport','books':'livres',
           'home':'maison','electronics':'électronique'},
    'it': {'music':'musica','food':'cibo','toys':'giocattoli','clothing':'abbigliamento',
           'furniture':'mobili','art':'arte','sports':'sport','books':'libri',
           'home':'casa','electronics':'elettronica'},
}
BRANDS = {
    'es': {'BrandA':'MarcaA','BrandB':'MarcaB','BrandC':'MarcaC','BrandD':'MarcaD',
           'BrandE':'MarcaE','Premium':'Premium','Budget':'Económico',
           'Generic':'Genérico','Store Brand':'Marca Propia','Luxury':'Lujo'},
    'fr': {'BrandA':'MarqueA','BrandB':'MarqueB','BrandC':'MarqueC','BrandD':'MarqueD',
           'BrandE':'MarqueE','Premium':'Premium','Budget':'Économique',
           'Generic':'Générique','Store Brand':'Marque Propre','Luxury':'Luxe'},
    'it': {'BrandA':'MarcaA','BrandB':'MarcaB','BrandC':'MarcaC','BrandD':'MarcaD',
           'BrandE':'MarcaE','Premium':'Premium','Budget':'Economico',
           'Generic':'Generico','Store Brand':'Marca del Negozio','Luxury':'Lusso'},
}
COLORS = {
    'es': {'small':'pequeño','red':'rojo','basic':'básico','large':'grande',
           'professional':'profesional','deluxe':'de lujo','blue':'azul',
           'standard':'estándar','premium':'premium','consumer':'consumidor'},
    'fr': {'small':'petit','red':'rouge','basic':'basique','large':'grand',
           'professional':'professionnel','deluxe':'de luxe','blue':'bleu',
           'standard':'standard','premium':'premium','consumer':'grand public'},
    'it': {'small':'piccolo','red':'rosso','basic':'base','large':'grande',
           'professional':'professionale','deluxe':'di lusso','blue':'blu',
           'standard':'standard','premium':'premium','consumer':'consumer'},
}
MATERIALS = {
    'es': {'Plastic':'Plástico','Wool':'Lana','Wood':'Madera','Glass':'Vidrio',
           'Leather':'Cuero','Nylon':'Nylon','Metal':'Metal','Cotton':'Algodón',
           'Polyester':'Poliéster','Silk':'Seda'},
    'fr': {'Plastic':'Plastique','Wool':'Laine','Wood':'Bois','Glass':'Verre',
           'Leather':'Cuir','Nylon':'Nylon','Metal':'Métal','Cotton':'Coton',
           'Polyester':'Polyester','Silk':'Soie'},
    'it': {'Plastic':'Plastica','Wool':'Lana','Wood':'Legno','Glass':'Vetro',
           'Leather':'Pelle','Nylon':'Nylon','Metal':'Metallo','Cotton':'Cotone',
           'Polyester':'Poliestere','Silk':'Seta'},
}
ITEM_PREFIX = {'es': 'Artículo_', 'fr': 'Article_', 'it': 'Articolo_'}

DESC_MOD = {
    'es': {'deluxe':'de lujo','consumer':'para consumidores','standard':'estándar',
           'small':'pequeño','large':'grande','red':'rojo','basic':'básico',
           'blue':'azul','premium':'premium','professional':'profesional','cheap':'económico'},
    'fr': {'deluxe':'de luxe','consumer':'grand public','standard':'standard',
           'small':'petit','large':'grand','red':'rouge','basic':'basique',
           'blue':'bleu','premium':'premium','professional':'professionnel','cheap':'pas cher'},
    'it': {'deluxe':'di lusso','consumer':'consumer','standard':'standard',
           'small':'piccolo','large':'grande','red':'rosso','basic':'base',
           'blue':'blu','premium':'premium','professional':'professionale','cheap':'economico'},
}
DESC_CAT = {
    'es': {'art':'arte','toys':'juguetes','home':'hogar','sports':'deportes',
           'electronics':'electrónica','electronic':'electrónica','books':'libros',
           'furniture':'muebles','clothing':'ropa','food':'alimentos','music':'música'},
    'fr': {'art':'art','toys':'jouets','home':'maison','sports':'sport',
           'electronics':'électronique','electronic':'électronique','books':'livres',
           'furniture':'mobilier','clothing':'vêtements','food':'alimentation','music':'musique'},
    'it': {'art':'arte','toys':'giocattoli','home':'casa','sports':'sport',
           'electronics':'elettronica','electronic':'elettronica','books':'libri',
           'furniture':'mobili','clothing':'abbigliamento','food':'cibo','music':'musica'},
}
DESC_TEMPLATE = {
    'es': lambda mod, cat: f'Un producto de {cat}' + (f' {mod}' if mod else ''),
    'fr': lambda mod, cat: f'Un produit de {cat}' + (f' {mod}' if mod else ''),
    'it': lambda mod, cat: f'Un prodotto di {cat}' + (f' {mod}' if mod else ''),
}
META_SOURCE = {
    'es': {'User Submission':'Envío de Usuario','Manual Entry':'Entrada Manual',
           'Web Scrape':'Extracción Web','API':'API','Import':'Importación','Scraper':'Raspador'},
    'fr': {'User Submission':'Soumission Utilisateur','Manual Entry':'Saisie Manuelle',
           'Web Scrape':'Extraction Web','API':'API','Import':'Importation','Scraper':'Extracteur'},
    'it': {'User Submission':'Invio Utente','Manual Entry':'Inserimento Manuale',
           'Web Scrape':'Estrazione Web','API':'API','Import':'Importazione','Scraper':'Estrattore'},
}
META_STATUS = {
    'es': {'Active':'Activo','Review':'Revisión','Archived':'Archivado','Pending':'Pendiente','Inactive':'Inactivo'},
    'fr': {'Active':'Actif','Review':'Révision','Archived':'Archivé','Pending':'En attente','Inactive':'Inactif'},
    'it': {'Active':'Attivo','Review':'Revisione','Archived':'Archiviato','Pending':'In attesa','Inactive':'Inattivo'},
}
META_DEPT = {
    'es': {'Support':'Soporte','Sales':'Ventas','Finance':'Finanzas','Marketing':'Marketing','Operations':'Operaciones'},
    'fr': {'Support':'Support','Sales':'Ventes','Finance':'Finance','Marketing':'Marketing','Operations':'Opérations'},
    'it': {'Support':'Supporto','Sales':'Vendite','Finance':'Finanza','Marketing':'Marketing','Operations':'Operazioni'},
}
META_QUALITY = {
    'es': {'Low':'Baja','High':'Alta','Medium':'Media'},
    'fr': {'Low':'Faible','High':'Élevée','Medium':'Moyenne'},
    'it': {'Low':'Bassa','High':'Alta','Medium':'Media'},
}

import re
_ALL_MODS = set(DESC_MOD['es'].keys()) | set(DESC_MOD['fr'].keys()) | set(DESC_MOD['it'].keys())
_ALL_CATS = set(DESC_CAT['es'].keys())
_DESC_RE = re.compile(
    r'^An?\s+(?:(' + '|'.join(_ALL_MODS) + r')\s+)?(' + '|'.join(_ALL_CATS) + r')\s+product$',
    re.IGNORECASE)

def translate_desc(desc, lang):
    m = _DESC_RE.match(desc.strip())
    if not m:
        return desc
    mod_en, cat_en = m.group(1), m.group(2).lower()
    cat = DESC_CAT[lang].get(cat_en, cat_en)
    mod = DESC_MOD[lang].get(mod_en.lower(), mod_en) if mod_en else ''
    return DESC_TEMPLATE[lang](mod, cat)

def translate_attrs(en_attrs_obj, lang):
    a = dict(en_attrs_obj)
    name = a.get('name', '')
    if '_' in name:
        suffix = name.split('_', 1)[1]
        a['name'] = ITEM_PREFIX[lang] + suffix
    a['tags'] = [TAGS[lang].get(t, t) for t in a.get('tags', [])]
    a['brand'] = BRANDS[lang].get(a.get('brand', ''), a.get('brand', ''))
    if a.get('color'):
        a['color'] = COLORS[lang].get(a['color'], a['color'])
    if a.get('material'):
        a['material'] = MATERIALS[lang].get(a['material'], a['material'])
    if a.get('description'):
        a['description'] = translate_desc(a['description'], lang)
    return a

def translate_meta(meta_obj, lang):
    m = dict(meta_obj)
    m['source'] = META_SOURCE[lang].get(m.get('source', ''), m.get('source', ''))
    m['status'] = META_STATUS[lang].get(m.get('status', ''), m.get('status', ''))
    if m.get('department'):
        m['department'] = META_DEPT[lang].get(m['department'], m['department'])
    if m.get('dataQuality'):
        m['dataQuality'] = META_QUALITY[lang].get(m['dataQuality'], m['dataQuality'])
    return m

def parse_json(s):
    if not s:
        return {}
    try:
        return json.loads(s)
    except Exception:
        return {}

# ── Build country → subtypes mapping ─────────────────────────────────────────

subtypes_by_country = {c: subtypes_for_country(c) for c in ['Spain', 'France', 'Italy']}
out_path = os.path.join(DATA_DIR, 'subtypes-by-country.json')
with open(out_path, 'w') as f:
    json.dump(subtypes_by_country, f, indent=2, ensure_ascii=False)
print(f'Wrote {out_path}')
for c, subs in subtypes_by_country.items():
    print(f'  {c}: {len(subs)} subtypes')

# ── Process Unknown run files ─────────────────────────────────────────────────

RUNS = [
    ('4_model_v1.csv', '4_spain.csv',  'es'),
    ('4_model_v2.csv', '4_france.csv', 'fr'),
]

FIELDS = ['benchmark_id', 'request_id', 'true_type', 'true_subtype',
          'pred_type', 'pred_subtype', 'attributes', 'metadata', 'en_attributes']

for src_name, dst_name, lang in RUNS:
    src = os.path.join(RUNS_DIR, src_name)
    dst = os.path.join(RUNS_DIR, dst_name)
    with open(src) as f:
        rows = list(csv.DictReader(f))
    out_rows = []
    for row in rows:
        en_attrs = parse_json(row.get('en_attributes', ''))
        meta     = parse_json(row.get('metadata', ''))
        tr_attrs = translate_attrs(en_attrs, lang) if en_attrs else {}
        tr_meta  = translate_meta(meta, lang) if meta else {}
        out_rows.append({
            'benchmark_id':  row['benchmark_id'],
            'request_id':    row['request_id'],
            'true_type':     row['true_type'],
            'true_subtype':  row['true_subtype'],
            'pred_type':     row['pred_type'],
            'pred_subtype':  row['pred_subtype'],
            'attributes':    json.dumps(tr_attrs, ensure_ascii=False),
            'metadata':      json.dumps(tr_meta, ensure_ascii=False),
            'en_attributes': row.get('en_attributes', ''),
        })
    with open(dst, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(out_rows)
    # Remove old file
    os.remove(src)
    print(f'Created {dst_name} from {src_name} ({lang})')

# ── Create Italy Unknown run ──────────────────────────────────────────────────

italy_records = [
    {
        'benchmark_id': '4', 'request_id': 'UNK-C001',
        'true_type': 'Unknown', 'true_subtype': 'Unknown',
        'pred_type': 'Security', 'pred_subtype': 'Vulnerability',
        'en_attributes': json.dumps({
            'sku': 'SKU-IT001', 'name': 'Item_xyz01', 'tags': ['electronics'],
            'brand': 'Generic', 'price': 299.00, 'description': 'A professional electronics product',
        }),
        'metadata': json.dumps({
            'region': 'EU', 'source': 'API', 'status': 'Active',
            'confidence': '71.4', 'department': 'Operations', 'dataQuality': 'High',
        }),
    },
    {
        'benchmark_id': '4', 'request_id': 'UNK-C002',
        'true_type': 'Unknown', 'true_subtype': 'Unknown',
        'pred_type': 'System', 'pred_subtype': 'Database',
        'en_attributes': json.dumps({
            'sku': 'SKU-IT002', 'name': 'Item_xyz02', 'tags': ['books', 'electronics'],
            'brand': 'Premium', 'price': 49.99, 'description': 'A standard books product',
        }),
        'metadata': json.dumps({
            'region': 'EU', 'source': 'Manual Entry', 'status': 'Review',
            'confidence': '55.2', 'department': 'Support', 'dataQuality': 'Medium',
        }),
    },
    {
        'benchmark_id': '4', 'request_id': 'UNK-C003',
        'true_type': 'Unknown', 'true_subtype': 'Unknown',
        'pred_type': 'Alert', 'pred_subtype': 'Error',
        'en_attributes': json.dumps({
            'sku': 'SKU-IT003', 'name': 'Item_xyz03', 'tags': ['art'],
            'brand': 'BrandA', 'price': 120.00, 'description': 'A deluxe art product',
        }),
        'metadata': json.dumps({
            'region': 'APAC', 'source': 'Web Scrape', 'status': 'Active',
            'confidence': '88.0', 'department': 'Finance', 'dataQuality': 'High',
        }),
    },
    {
        'benchmark_id': '4', 'request_id': 'UNK-C004',
        'true_type': 'Unknown', 'true_subtype': 'Unknown',
        'pred_type': 'Support', 'pred_subtype': 'Ticket',
        'en_attributes': json.dumps({
            'sku': 'SKU-IT004', 'name': 'Item_xyz04', 'tags': ['clothing', 'sports'],
            'brand': 'Budget', 'price': 35.50, 'description': 'A basic clothing product',
        }),
        'metadata': json.dumps({
            'region': 'NA', 'source': 'Import', 'status': 'Pending',
            'confidence': '42.7', 'department': 'Sales', 'dataQuality': 'Low',
        }),
    },
    {
        'benchmark_id': '4', 'request_id': 'UNK-C005',
        'true_type': 'Unknown', 'true_subtype': 'Unknown',
        'pred_type': 'Analytics', 'pred_subtype': 'Conversion',
        'en_attributes': json.dumps({
            'sku': 'SKU-IT005', 'name': 'Item_xyz05', 'tags': ['music', 'art'],
            'brand': 'Luxury', 'price': 580.00, 'description': 'A premium music product',
        }),
        'metadata': json.dumps({
            'region': 'MENA', 'source': 'API', 'status': 'Active',
            'confidence': '94.3', 'department': 'Marketing', 'dataQuality': 'High',
        }),
    },
]

lang = 'it'
dst = os.path.join(RUNS_DIR, '4_italy.csv')
out_rows = []
for rec in italy_records:
    en_attrs = parse_json(rec['en_attributes'])
    meta     = parse_json(rec['metadata'])
    tr_attrs = translate_attrs(en_attrs, lang)
    tr_meta  = translate_meta(meta, lang)
    out_rows.append({
        'benchmark_id':  rec['benchmark_id'],
        'request_id':    rec['request_id'],
        'true_type':     rec['true_type'],
        'true_subtype':  rec['true_subtype'],
        'pred_type':     rec['pred_type'],
        'pred_subtype':  rec['pred_subtype'],
        'attributes':    json.dumps(tr_attrs, ensure_ascii=False),
        'metadata':      json.dumps(tr_meta, ensure_ascii=False),
        'en_attributes': rec['en_attributes'],
    })
with open(dst, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=FIELDS)
    w.writeheader()
    w.writerows(out_rows)
print(f'Created 4_italy.csv ({len(out_rows)} records, it)')

# ── Update leaderboard.csv ────────────────────────────────────────────────────

lb_path = os.path.join(DATA_DIR, 'leaderboard.csv')
with open(lb_path) as f:
    rows = list(csv.DictReader(f))
fields = list(rows[0].keys())

rename = {'model_v1': 'spain', 'model_v2': 'france'}
new_rows = []
for row in rows:
    if row['benchmark'] == 'Unknowns':
        row['run_name'] = rename.get(row['run_name'], row['run_name'])
    new_rows.append(row)

# Add Italy
new_rows.append({
    'benchmark': 'Unknowns', 'run_name': 'italy',
    'model_name': '1.2.0', 'subtype_weighted_f1': '0',
    'run_date': '2026-04-10T10:00:00Z',
})

with open(lb_path, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(new_rows)
print('Updated leaderboard.csv (Unknowns: spain, france, italy)')

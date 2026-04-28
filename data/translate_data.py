#!/usr/bin/env python3
"""Translate benchmark data: Spain (es), France (fr), Italy (it)."""
import csv, json, re, glob, os, shutil

BENCH_NAMES = {1: 'Spain', 2: 'France', 3: 'Italy'}
BENCH_LANG  = {1: 'es',    2: 'fr',    3: 'it'}

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

HE_TAGS = {'מוזיקה':'music','מזון':'food','צעצועים':'toys','ביגוד':'clothing',
           'ריהוט':'furniture','אמנות':'art','ספורט':'sports','ספרים':'books',
           'בית':'home','אלקטרוניקה':'electronics'}
HE_BRANDS = {'מותג א':'BrandA','מותג ב':'BrandB','מותג ג':'BrandC','מותג ד':'BrandD',
             'מותג ה':'BrandE','פרמיום':'Premium','תקציב':'Budget','גנרי':'Generic',
             'מותג חנות':'Store Brand','יוקרה':'Luxury'}
HE_COLORS = {'קטן':'small','אדום':'red','בסיסי':'basic','גדול':'large',
             'מקצועי':'professional','דלוקס':'deluxe','כחול':'blue',
             'סטנדרטי':'standard','פרמיום':'premium','צרכני':'consumer'}
HE_MATS   = {'פלסטיק':'Plastic','צמר':'Wool','עץ':'Wood','זכוכית':'Glass',
             'עור':'Leather','ניילון':'Nylon','מתכת':'Metal','כותנה':'Cotton',
             'פוליאסטר':'Polyester','משי':'Silk'}
HE_DESC_CAT = {'ריהוט':'furniture','צעצועים':'toys','אלקטרוניקה':'electronics',
               'מוזיקה':'music','מזון':'food','ספרים':'books','בית':'home',
               'אמנות':'art','ספורט':'sports','ביגוד':'clothing'}
HE_DESC_MOD = {'קטן':'small','אדום':'red','בסיסי':'basic','גדול':'large',
               'מקצועי':'professional','דלוקס':'deluxe','כחול':'blue',
               'סטנדרטי':'standard','פרמיום':'premium','צרכני':'consumer','זול':'cheap'}

def he_to_en_attrs(attrs_str):
    """Convert Hebrew attributes JSON to English attributes JSON."""
    try:
        a = json.loads(attrs_str)
    except Exception:
        return attrs_str
    name = a.get('name', '')
    if name.startswith('פריט_'):
        a['name'] = 'Item_' + name[len('פריט_'):]
    a['tags'] = [HE_TAGS.get(t, t) for t in a.get('tags', [])]
    a['brand'] = HE_BRANDS.get(a.get('brand', ''), a.get('brand', ''))
    a['color'] = HE_COLORS.get(a.get('color', ''), a.get('color', ''))
    a['material'] = HE_MATS.get(a.get('material', ''), a.get('material', ''))
    desc = a.get('description', '')
    if desc:
        # Hebrew format: "מוצר {cat} {mod}" (product cat modifier)
        parts = desc.split()
        if parts and parts[0] == 'מוצר' and len(parts) >= 2:
            cat_en = HE_DESC_CAT.get(parts[1], parts[1])
            mod_en = HE_DESC_MOD.get(parts[2], parts[2]) if len(parts) > 2 else ''
            a['description'] = ('A ' + mod_en + ' ' + cat_en + ' product').strip().replace('  ', ' ')
        else:
            a['description'] = desc
    return json.dumps(a, ensure_ascii=False)

DESC_TEMPLATE = {
    'es': lambda mod, cat: f'Un producto de {cat}' + (f' {mod}' if mod else ''),
    'fr': lambda mod, cat: f'Un produit de {cat}' + (f' {mod}' if mod else ''),
    'it': lambda mod, cat: f'Un prodotto di {cat}' + (f' {mod}' if mod else ''),
}

_DESC_RE = re.compile(
    r'^An?\s+(?:(' + '|'.join(DESC_MOD['es'].keys() | DESC_MOD['fr'].keys() | DESC_MOD['it'].keys()) + r')\s+)?'
    r'(' + '|'.join(DESC_CAT['es'].keys()) + r')\s+product$',
    re.IGNORECASE
)

def translate_desc(desc, lang):
    m = _DESC_RE.match(desc.strip())
    if not m:
        return desc
    mod_en, cat_en = m.group(1), m.group(2).lower()
    cat = DESC_CAT[lang].get(cat_en, cat_en)
    mod = DESC_MOD[lang].get(mod_en.lower(), mod_en) if mod_en else ''
    return DESC_TEMPLATE[lang](mod, cat)

def translate_attrs(en_attrs_str, lang, he_attrs_str=''):
    if not en_attrs_str and he_attrs_str:
        en_attrs_str = he_to_en_attrs(he_attrs_str)
    try:
        a = json.loads(en_attrs_str)
    except Exception:
        return en_attrs_str
    name = a.get('name', '')
    if '_' in name:
        prefix, suffix = name.split('_', 1)
        a['name'] = ITEM_PREFIX[lang] + suffix
    a['tags'] = [TAGS[lang].get(t, t) for t in a.get('tags', [])]
    a['brand'] = BRANDS[lang].get(a.get('brand', ''), a.get('brand', ''))
    a['color'] = COLORS[lang].get(a.get('color', ''), a.get('color', ''))
    a['material'] = MATERIALS[lang].get(a.get('material', ''), a.get('material', ''))
    if a.get('description'):
        a['description'] = translate_desc(a['description'], lang)
    return json.dumps(a, ensure_ascii=False)

def translate_meta(meta_str, lang):
    try:
        m = json.loads(meta_str)
    except Exception:
        return meta_str
    m['source'] = META_SOURCE[lang].get(m.get('source', ''), m.get('source', ''))
    m['status'] = META_STATUS[lang].get(m.get('status', ''), m.get('status', ''))
    if m.get('department'):
        m['department'] = META_DEPT[lang].get(m['department'], m['department'])
    if m.get('dataQuality'):
        m['dataQuality'] = META_QUALITY[lang].get(m['dataQuality'], m['dataQuality'])
    return json.dumps(m, ensure_ascii=False)

# --- Update benchmarks.csv ---
bench_path = '/home/eyalshw/github/wzender/magellan/data/benchmarks.csv'
with open(bench_path) as f:
    rows = list(csv.DictReader(f))
for row in rows:
    bid = int(row['id'])
    if bid in BENCH_NAMES:
        row['name'] = BENCH_NAMES[bid]
with open(bench_path, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['id','name','created_at'])
    w.writeheader()
    w.writerows(rows)
print('Updated benchmarks.csv')

# --- Update leaderboard.csv ---
leader_path = '/home/eyalshw/github/wzender/magellan/data/leaderboard.csv'
old_to_new = {'Benchmark Q1 2026':'Spain','Benchmark Q2 2026':'France','Test Benchmark':'Italy'}
with open(leader_path) as f:
    rows = list(csv.DictReader(f))
fields = list(rows[0].keys())
for row in rows:
    row['benchmark'] = old_to_new.get(row['benchmark'], row['benchmark'])
with open(leader_path, 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=fields)
    w.writeheader()
    w.writerows(rows)
print('Updated leaderboard.csv')

# --- Update run CSVs ---
runs_dir = '/home/eyalshw/github/wzender/magellan/data/runs'
for csv_path in sorted(glob.glob(os.path.join(runs_dir, '*.csv'))):
    fname = os.path.basename(csv_path)
    bid = int(fname.split('_')[0])
    lang = BENCH_LANG.get(bid)
    if lang is None:
        print(f'Skipping {fname} (no translation for benchmark_id={bid})')
        continue
    with open(csv_path) as f:
        rows = list(csv.DictReader(f))
    if not rows:
        continue
    fields = list(rows[0].keys())
    for row in rows:
        row['attributes'] = translate_attrs(row.get('en_attributes', ''), lang, row.get('attributes', ''))
        row['metadata']   = translate_meta(row.get('metadata', '{}'), lang)
    with open(csv_path, 'w', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f'Translated {fname} → {lang}')

print('Done.')

"""Contrôle visuel du calage : silhouette du maillage (rouge) sur la capture."""
import sys, json, numpy as np
from PIL import Image
sys.argv += []
cal = json.load(open(sys.argv[1])); dense = np.load(sys.argv[2]); cap = sys.argv[3]; name = sys.argv[4]; out = sys.argv[5]
V = dense['v'].astype(float) - np.array(cal[name]['center'])
c = cal[name]
ca, sa, ce, se = np.cos(c['az']), np.sin(c['az']), np.cos(c['el']), np.sin(c['el'])
R = np.array([[1, 0, 0], [0, ce, -se], [0, se, ce]]) @ np.array([[ca, 0, -sa], [0, 1, 0], [sa, 0, ca]])
q = V @ R.T
w = 1 / (1 - c.get('k', 0) * q[:, 2])
u = q[:, 0] * w * c['s'] + c['tx']; v = -q[:, 1] * w * c['s'] + c['ty']
im = Image.open(f"{cap}/c{name}").convert('RGB'); a = np.asarray(im).copy()
ok = (u >= 0) & (u < a.shape[1]) & (v >= 0) & (v < a.shape[0])
a[v[ok].astype(int), u[ok].astype(int)] = (a[v[ok].astype(int), u[ok].astype(int)] * 0.4 + np.array([255, 0, 0]) * 0.6).astype(np.uint8)
Image.fromarray(a).save(out)

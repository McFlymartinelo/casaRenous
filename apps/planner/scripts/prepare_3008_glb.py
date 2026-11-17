#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prépare le GLB du Peugeot 3008 pour le planificateur.

Le GLB original (Sketchfab, aimix) contient un plan de sol « ground » de
54 × 54 unités qui écrase la boîte englobante, et la voiture est orientée
suivant l'axe X. Ce script :

1. retire le nœud `ground` de la scène,
2. tourne la voiture de -90° autour de Y (longueur ramenée sur Z, avant vers -Z),
3. met à l'échelle en mètres, centre en X/Z et pose au sol (Y min = 0),
4. réécrit `3008.glb` en place (copie brute conservée dans `scripts/originals/`).

Usage : python scripts/prepare_3008_glb.py
"""

import json
import math
import os
import shutil
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
CHEMIN = os.path.join(HERE, "..", "public", "models", "3008.glb")
LONGUEUR_CIBLE = 4.45  # mètres (3008 réelle : 4,45 m)


def lire_glb(chemin):
    data = open(chemin, "rb").read()
    magic, version, _ = struct.unpack_from("<III", data, 0)
    if magic != 0x46546C67 or version != 2:
        raise ValueError("GLB invalide")
    offset = 12
    json_chunk = bin_chunk = None
    while offset < len(data):
        taille, type_chunk = struct.unpack_from("<II", data, offset)
        offset += 8
        contenu = data[offset:offset + taille]
        offset += taille
        if type_chunk == 0x4E4F534A:
            json_chunk = contenu
        elif type_chunk == 0x004E4942:
            bin_chunk = contenu
    return json.loads(json_chunk), bin_chunk


def ecrire_glb(chemin, doc, bin_chunk):
    json_bytes = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)
    with open(chemin, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_chunk), 0x004E4942))
        f.write(bin_chunk)


def matmul(a, b):
    """Produit de matrices glTF stockées en column-major."""
    return [
        sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
        for c in range(4) for r in range(4)
    ]


def appliquer(m, v):
    """Applique une matrice column-major à un point 3D."""
    return tuple(
        sum(m[c * 4 + r] * v[c] for c in range(3)) + m[12 + r]
        for r in range(3)
    )


def bounds(doc, exclure):
    mn, mx = [1e30] * 3, [-1e30] * 3
    identite = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

    def marche(index, parent):
        noeud = doc["nodes"][index]
        if index in exclure:
            return
        m = matmul(parent, noeud.get("matrix", identite))
        if "mesh" in noeud:
            for prim in doc["meshes"][noeud["mesh"]]["primitives"]:
                acc = doc["accessors"][prim["attributes"]["POSITION"]]
                lo, hi = acc["min"], acc["max"]
                for x in (lo[0], hi[0]):
                    for y in (lo[1], hi[1]):
                        for z in (lo[2], hi[2]):
                            w = appliquer(m, (x, y, z))
                            for i in range(3):
                                mn[i] = min(mn[i], w[i])
                                mx[i] = max(mx[i], w[i])
        for enfant in noeud.get("children", []):
            marche(enfant, m)

    for racine in doc["scenes"][0]["nodes"]:
        marche(racine, identite)
    return mn, mx


def main():
    doc, bin_chunk = lire_glb(CHEMIN)

    # 1. repérer et retirer le plan de sol
    a_retirer = set()
    for i, noeud in enumerate(doc["nodes"]):
        if "ground" in noeud.get("name", "").lower():
            a_retirer.add(i)
    if not a_retirer:
        raise SystemExit("nœud 'ground' introuvable : GLB déjà préparé ?")
    for noeud in doc["nodes"]:
        noeud["children"] = [c for c in noeud.get("children", []) if c not in a_retirer]
    doc["scenes"][0]["nodes"] = [
        r for r in doc["scenes"][0]["nodes"] if r not in a_retirer
    ]
    print("nœuds ground retirés :", sorted(a_retirer))

    # 2/3. rotation -90° autour de Y, échelle, recentrage
    mn, mx = bounds(doc, a_retirer)
    print("boîte sans ground :", [round(v, 2) for v in mn], [round(v, 2) for v in mx])

    # après rotation -90° autour de Y : x' = -z, y' = y, z' = x
    axe_x = [mn[2], mx[2]]       # largeur (ex-Z)
    axe_y = [mn[1], mx[1]]       # hauteur
    axe_z = [mn[0], mx[0]]       # longueur (ex-X)
    echelle = LONGUEUR_CIBLE / (axe_z[1] - axe_z[0])
    # centres dans le repère d'ORIGINE (utilisés pour la translation après rotation)
    centre_x = (mn[0] + mx[0]) / 2
    centre_z = (mn[2] + mx[2]) / 2

    cos, sin = math.cos(-math.pi / 2), math.sin(-math.pi / 2)
    # rotation Y (-90°) : colonnes (cos,0,-sin), (0,1,0), (sin,0,cos)
    r = [
        cos, 0, -sin, 0,
        0, 1, 0, 0,
        sin, 0, cos, 0,
        0, 0, 0, 1,
    ]
    s = [
        echelle, 0, 0, 0,
        0, echelle, 0, 0,
        0, 0, echelle, 0,
        0, 0, 0, 1,
    ]
    # après rotation : x' = -z (centre -centre_z), z' = x (centre +centre_x).
    # La translation ramène le centre en X/Z et le minimum Y à zéro.
    t = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        centre_z * echelle, -axe_y[0] * echelle, -centre_x * echelle, 1,
    ]
    transformation = matmul(matmul(t, r), s)

    # 4. nouvelle racine qui porte la transformation
    nouvelle_racine = len(doc["nodes"])
    doc["nodes"].append({
        "name": "3008_Placee",
        "children": list(doc["scenes"][0]["nodes"]),
        "matrix": transformation,
    })
    doc["scenes"][0]["nodes"] = [nouvelle_racine]

    mn2, mx2 = bounds(doc, a_retirer)
    print("échelle :", round(echelle, 5))
    print("boîte finale :", [round(v, 3) for v in mn2], [round(v, 3) for v in mx2])
    print("dimensions finales :", [round(mx2[i] - mn2[i], 3) for i in range(3)])

    original = os.path.join(HERE, "originals", "3008.original.glb")
    os.makedirs(os.path.dirname(original), exist_ok=True)
    if not os.path.exists(original):
        shutil.copy2(CHEMIN, original)
    ecrire_glb(CHEMIN, doc, bin_chunk)
    print("GLB réécrit :", os.path.abspath(CHEMIN))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CASA RENOUS — reconstruction 3D du pavillon (RDC + étage) dans Blender
======================================================================

Génère depuis les plans fournis par Maisons Belles Demeures :

  * le volume général (7,10 x 13,60 m, toit à deux pans),
  * les murs extérieurs avec leurs ouvertures (fenêtres, baies, portes, porte de garage),
  * les cloisons intérieures des deux niveaux,
  * les dalles, l'escalier et sa trémie,
  * un mobilier sommaire pour donner l'échelle,
  * les étiquettes des pièces (nom + surface du plan),
  * l'environnement (terrasse bois, pavés de la rue, gazon),
  * 5 caméras (façade jardin / façade rue / intérieur / plans ortho),
  * les images de référence en fond de scène (dossier `references/`).

Utilisation
-----------
Ligne de commande (recommandé) :

    blender --background --python casa_renous.py

Dans Blender :

    Text Editor > Open > blender/casa_renous.py > Run Script (Alt+P)

Le script repart d'une scène vide (CLEAR_SCENE = True). Sauvegardez votre
travail avant de le lancer dans un fichier existant.

Conventions
-----------
  X : largeur de la maison, 0 = façade gauche, 7,10 = façade droite
  Y : profondeur, 0 = façade jardin (séjour), 13,60 = façade rue (garage)
  Z : hauteur, 0 = sol fini du RDC

Les murs sont tous alignés sur les axes : le script n'accepte que ça.
Chaque mur est une ligne de la liste `MURS_RDC` / `MURS_ETAGE` : il suffit
de modifier les coordonnées ou la liste d'ouvertures pour corriger un détail.

Fiabilité des cotes
-------------------
Les cotes issues du plan (7,10 / 13,60 / 6,34 / ouvertures en façade, surfaces
des pièces) sont respectées. En revanche, la position exacte de certaines
cloisons intérieures est une reconstitution : une photo de plan ne permet pas
de lire au millimètre les épaisseurs de murs. Les zones les plus incertaines
sont signalées par un commentaire "APPROX" dans les listes de murs.
"""

import math
import os

import bpy

# ---------------------------------------------------------------------------
# 1. RÉGLAGES GÉNÉRAUX
# ---------------------------------------------------------------------------

CLEAR_SCENE = True          # vide la scène avant de construire
BUILD_FURNITURE = True      # mobilier sommaire
BUILD_LABELS = True         # étiquettes des pièces (nom + surface)
BUILD_SITE = True           # terrasse, pavés, gazon
BUILD_REFERENCES = True     # images de référence en fond de scène
SAVE_BLEND = True           # sauvegarde .blend (uniquement en --background)
RENDER_PREVIEWS = False     # rend les 4 vues dans renders/ (long, en --background)

# --- Cotes principales (m) -------------------------------------------------
LARGEUR = 7.10              # cote extérieure, plan
PROFONDEUR = 13.60          # cote extérieure, plan
MUR_EXT = 0.38              # épaisseur murs extérieurs (7,10 - 6,34 = 0,76)
MUR_INT = 0.10              # cloisons de distribution
MUR_PORTEUR = 0.20          # murs porteurs intérieurs
H_RDC = 2.60                # hauteur sous plafond du RDC
H_ETAGE = 2.50              # hauteur sous plafond de l'étage
EP_DALLE = 0.25             # épaisseur de la dalle intermédiaire
Z_ETAGE = H_RDC + EP_DALLE  # altitude du sol fini de l'étage (2,85)
Z_EGOUT = Z_ETAGE + H_ETAGE # altitude du haut des murs (5,35)
PENTE_TOIT = math.radians(28)
DEBORD_TOIT = 0.55          # débord de toiture
EP_TOIT = 0.22              # épaisseur de la couverture

X0 = MUR_EXT                # 0,38  face intérieure gauche
X1 = LARGEUR - MUR_EXT      # 6,72  face intérieure droite
Y0 = MUR_EXT                # 0,38  face intérieure jardin
Y1 = PROFONDEUR - MUR_EXT   # 13,22 face intérieure rue

# Escalier RDC -> étage
ESC_X0, ESC_X1 = 5.55, 6.50
ESC_Y_BAS = 7.60            # nez de la première marche
ESC_MARCHES = 12
ESC_GIRON = 0.26
ESC_HAUTEUR = Z_ETAGE       # 2,85
TREMIE = (5.45, 6.72, 4.05, 6.60)   # x0, x1, y0, y1 (trémie dans la dalle)

MATS = {}
COLS = {}


# ---------------------------------------------------------------------------
# 2. OUTILS GÉNÉRIQUES
# ---------------------------------------------------------------------------

def dossier_script():
    """Dossier du script (ou du .blend si exécuté depuis l'éditeur de texte)."""
    try:
        chemin = os.path.abspath(__file__)
        if os.path.isfile(chemin):
            return os.path.dirname(chemin)
    except NameError:
        pass
    if bpy.data.filepath:
        return os.path.dirname(bpy.data.filepath)
    return os.getcwd()


def _set_input(node, noms, valeur):
    """Renseigne une entrée de nœud en tolérant les renommages Blender 3.x/4.x."""
    for nom in noms:
        if nom in node.inputs:
            node.inputs[nom].default_value = valeur
            return True
    return False


def make_material(nom, couleur, rugosite=0.6, metallique=0.0,
                  alpha=1.0, emission=None):
    mat = bpy.data.materials.new(nom)
    mat.use_nodes = True
    noeud = mat.node_tree.nodes.get("Principled BSDF")
    if noeud is None:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED":
                noeud = n
                break
    if noeud is not None:
        _set_input(noeud, ("Base Color",), (couleur[0], couleur[1], couleur[2], 1.0))
        _set_input(noeud, ("Roughness",), rugosite)
        _set_input(noeud, ("Metallic",), metallique)
        if alpha < 1.0:
            _set_input(noeud, ("Alpha",), alpha)
            for attribut, valeur in (("blend_method", "BLEND"),
                                     ("surface_render_method", "BLENDED")):
                try:
                    setattr(mat, attribut, valeur)
                except (AttributeError, TypeError):
                    pass
        if emission is not None:
            _set_input(noeud, ("Emission Color", "Emission"),
                       (emission[0], emission[1], emission[2], 1.0))
            _set_input(noeud, ("Emission Strength",), 1.0)
    mat.diffuse_color = (couleur[0], couleur[1], couleur[2], alpha)
    return mat


def new_collection(nom, parent=None):
    col = bpy.data.collections.new(nom)
    (parent or bpy.context.scene.collection).children.link(col)
    return col


def _add_box(verts, faces, x0, x1, y0, y1, z0, z1):
    xa, xb = min(x0, x1), max(x0, x1)
    ya, yb = min(y0, y1), max(y0, y1)
    za, zb = min(z0, z1), max(z0, z1)
    if xb - xa < 1e-6 or yb - ya < 1e-6 or zb - za < 1e-6:
        return
    i = len(verts)
    verts.extend([
        (xa, ya, za), (xb, ya, za), (xb, yb, za), (xa, yb, za),
        (xa, ya, zb), (xb, ya, zb), (xb, yb, zb), (xa, yb, zb),
    ])
    faces.extend([
        (i + 3, i + 2, i + 1, i + 0),
        (i + 4, i + 5, i + 6, i + 7),
        (i + 0, i + 1, i + 5, i + 4),
        (i + 1, i + 2, i + 6, i + 5),
        (i + 2, i + 3, i + 7, i + 6),
        (i + 3, i + 0, i + 4, i + 7),
    ])


def mesh_object(nom, verts, faces, material, collection):
    me = bpy.data.meshes.new(nom)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(nom, me)
    if material is not None:
        me.materials.append(material)
    collection.objects.link(ob)
    return ob


def boxes_object(nom, boxes, material, collection):
    verts, faces = [], []
    for b in boxes:
        _add_box(verts, faces, *b)
    if not faces:
        return None
    return mesh_object(nom, verts, faces, material, collection)


def prism_object(nom, profil, axe, epaisseur, material, collection):
    """Prisme extrudé depuis un profil 2D (utile pour les pignons).

    profil : liste de (u, z) ; axe : 'y' ou 'x' ; epaisseur : profondeur.
    """
    if axe == "y":
        base = [(u, 0.0, z) for (u, z) in profil]
        autre = [(u, epaisseur, z) for (u, z) in profil]
    else:
        base = [(0.0, u, z) for (u, z) in profil]
        autre = [(epaisseur, u, z) for (u, z) in profil]
    verts = base + autre
    n = len(profil)
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return mesh_object(nom, verts, faces, material, collection)


def label(nom, texte, x, y, z, collection, taille=0.22, material=None):
    cu = bpy.data.curves.new(nom, type="FONT")
    cu.body = texte
    cu.size = taille
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    if material is not None:
        cu.materials.append(material)
    ob = bpy.data.objects.new(nom, cu)
    ob.location = (x, y, z)
    collection.objects.link(ob)
    return ob


# ---------------------------------------------------------------------------
# 3. MATÉRIAUX ET COLLECTIONS
# ---------------------------------------------------------------------------

def setup_materials():
    MATS["enduit"] = make_material("Enduit_Blanc", (0.855, 0.840, 0.805), 0.85)
    MATS["interieur"] = make_material("Platre_Interieur", (0.930, 0.925, 0.910), 0.90)
    MATS["cloison"] = make_material("Cloison", (0.915, 0.910, 0.895), 0.90)
    MATS["sol_bois"] = make_material("Parquet", (0.520, 0.375, 0.240), 0.55)
    MATS["sol_etage"] = make_material("Parquet_Etage", (0.560, 0.410, 0.265), 0.55)
    MATS["carrelage"] = make_material("Carrelage", (0.780, 0.780, 0.770), 0.35)
    MATS["beton"] = make_material("Beton", (0.520, 0.520, 0.510), 0.90)
    MATS["tuile"] = make_material("Tuile_Terre_Cuite", (0.215, 0.115, 0.090), 0.80)
    MATS["verre"] = make_material("Vitrage", (0.740, 0.840, 0.870), 0.05, alpha=0.22)
    MATS["menuiserie"] = make_material("Menuiserie_Blanche", (0.945, 0.945, 0.930), 0.45)
    MATS["bois"] = make_material("Bois_Massif", (0.400, 0.260, 0.150), 0.60)
    MATS["terrasse"] = make_material("Lame_Terrasse", (0.395, 0.270, 0.165), 0.75)
    MATS["gazon"] = make_material("Gazon", (0.185, 0.300, 0.130), 0.95)
    MATS["pave"] = make_material("Paves", (0.400, 0.400, 0.420), 0.90)
    MATS["tissu"] = make_material("Tissu", (0.520, 0.525, 0.560), 0.95)
    MATS["textile_blanc"] = make_material("Linge_Blanc", (0.880, 0.880, 0.870), 0.90)
    MATS["laiton"] = make_material("Laiton", (0.700, 0.560, 0.280), 0.35, metallique=0.9)
    MATS["texte"] = make_material("Etiquette", (0.060, 0.060, 0.065), 0.90)


def setup_collections():
    racine = bpy.context.scene.collection
    COLS["reperes"] = new_collection("00_Reperes", racine)
    COLS["rdc"] = new_collection("01_RDC", racine)
    COLS["etage"] = new_collection("02_Etage", racine)
    COLS["toit"] = new_collection("03_Toiture", racine)
    COLS["site"] = new_collection("04_Exterieur", racine)
    COLS["mobilier_rdc"] = new_collection("05_Mobilier_RDC", racine)
    COLS["mobilier_etage"] = new_collection("05_Mobilier_Etage", racine)
    COLS["label_rdc"] = new_collection("07_Etiquettes_RDC", racine)
    COLS["label_etage"] = new_collection("07_Etiquettes_Etage", racine)
    COLS["camera"] = new_collection("06_Cameras_Lumieres", racine)


# ---------------------------------------------------------------------------
# 4. MURS
# ---------------------------------------------------------------------------

def op(pos, w, h, sill=0.0, kind="window"):
    """Ouverture : pos = centre depuis le début du mur, w = largeur, h = hauteur."""
    return {"pos": pos, "w": w, "h": h, "sill": sill, "kind": kind}


def build_wall(nom, p1, p2, epaisseur, hauteur, z0, ouvertures,
               material, collection, jointe=True):
    """Construit un mur rectiligne à ouvertures (murs parallèles aux axes)."""
    x1, y1 = p1
    x2, y2 = p2
    dx, dy = x2 - x1, y2 - y1
    longueur = math.hypot(dx, dy)
    if longueur < 1e-6:
        return None
    horizontal = abs(dx) >= abs(dy)
    sx = 1.0 if dx >= 0 else -1.0
    sy = 1.0 if dy >= 0 else -1.0
    demi = epaisseur / 2.0

    def boite(a, b, za, zb):
        if horizontal:
            xa, xb = sorted((x1 + sx * a, x1 + sx * b))
            return (xa, xb, y1 - demi, y1 + demi, z0 + za, z0 + zb)
        ya, yb = sorted((y1 + sy * a, y1 + sy * b))
        return (x1 - demi, x1 + demi, ya, yb, z0 + za, z0 + zb)

    def ouverture_rect(o):
        a = o["pos"] - o["w"] / 2.0
        b = o["pos"] + o["w"] / 2.0
        zs = z0 + o.get("sill", 0.0)
        ze = zs + o["h"]
        if horizontal:
            xa, xb = sorted((x1 + sx * a, x1 + sx * b))
            return (xa, xb, y1 - demi, y1 + demi, zs, ze)
        ya, yb = sorted((y1 + sy * a, y1 + sy * b))
        return (x1 - demi, x1 + demi, ya, yb, zs, ze)

    ops = sorted(ouvertures or [], key=lambda o: o["pos"])
    for o in ops:
        if o["pos"] - o["w"] / 2.0 < -1e-6 or o["pos"] + o["w"] / 2.0 > longueur + 1e-6:
            print("[casa-renous] ATTENTION : ouverture hors mur dans '%s' "
                  "(pos %.2f, largeur %.2f, mur %.2f)" % (nom, o["pos"], o["w"], longueur))
    boxes = []
    curseur = 0.0
    for o in ops:
        a = max(0.0, o["pos"] - o["w"] / 2.0)
        b = min(longueur, o["pos"] + o["w"] / 2.0)
        if a > curseur + 1e-6:
            boxes.append(boite(curseur, a, 0.0, hauteur))
        s = o.get("sill", 0.0)
        haut_op = s + o["h"]
        if s > 1e-6:
            boxes.append(boite(a, b, 0.0, s))
        if haut_op < hauteur - 1e-6:
            boxes.append(boite(a, b, haut_op, hauteur))
        curseur = b
    if curseur < longueur - 1e-6:
        boxes.append(boite(curseur, longueur, 0.0, hauteur))

    ob = boxes_object(nom, boxes, material, collection)

    if jointe:
        cadres, vitrages, battants = [], [], []
        f = 0.07
        for o in ops:
            xa, xb, ya, yb, zs, ze = ouverture_rect(o)
            kind = o.get("kind", "window")
            if kind in ("window", "bay"):
                cadres += [
                    (xa, xa + f, ya, yb, zs, ze),
                    (xb - f, xb, ya, yb, zs, ze),
                    (xa + f, xb - f, ya, yb, zs, zs + f),
                    (xa + f, xb - f, ya, yb, ze - f, ze),
                ]
                if horizontal:
                    cy = (ya + yb) / 2.0
                    vitrages.append((xa + f, xb - f, cy - 0.015, cy + 0.015,
                                     zs + f, ze - f))
                else:
                    cx = (xa + xb) / 2.0
                    vitrages.append((cx - 0.015, cx + 0.015, ya + f, yb - f,
                                     zs + f, ze - f))
            elif kind == "door":
                cadres += [
                    (xa, xa + f, ya, yb, zs, ze),
                    (xb - f, xb, ya, yb, zs, ze),
                    (xa + f, xb - f, ya, yb, ze - f, ze),
                ]
                if horizontal:
                    cy = (ya + yb) / 2.0
                    battants.append((xa + f, xb - f, cy - 0.03, cy + 0.03,
                                     zs, ze - f))
                else:
                    cx = (xa + xb) / 2.0
                    battants.append((cx - 0.03, cx + 0.03, ya + f, yb - f,
                                     zs, ze - f))
            elif kind == "garage":
                if horizontal:
                    cy = (ya + yb) / 2.0
                    battants.append((xa, xb, cy - 0.06, cy + 0.06, zs + 0.02, ze - 0.02))
                else:
                    cx = (xa + xb) / 2.0
                    battants.append((cx - 0.06, cx + 0.06, ya, yb, zs + 0.02, ze - 0.02))
        if cadres:
            boxes_object(nom + "_Dormants", cadres, MATS["menuiserie"], collection)
        if vitrages:
            boxes_object(nom + "_Vitrage", vitrages, MATS["verre"], collection)
        if battants:
            boxes_object(nom + "_Battants", battants, MATS["menuiserie"], collection)
    return ob


def build_walls(definition, z0, hauteur, par_defaut, collection):
    for mur in definition:
        nom, p1, p2, ep, ops = mur[0], mur[1], mur[2], mur[3], mur[4]
        mat = MATS[mur[5]] if len(mur) > 5 else par_defaut
        h = mur[6] if len(mur) > 6 else hauteur
        build_wall(nom, p1, p2, ep, h, z0, ops, mat, collection)


# ---------------------------------------------------------------------------
# 5. DALLES, ESCALIER, TOITURE
# ---------------------------------------------------------------------------

def build_slab(nom, x0, x1, y0, y1, zb, zh, material, collection, trou=None):
    boxes = []
    if trou:
        hx0, hx1, hy0, hy1 = trou
        hx0, hx1 = max(hx0, x0), min(hx1, x1)
        hy0, hy1 = max(hy0, y0), min(hy1, y1)
        if hx0 > x0 + 1e-6:
            boxes.append((x0, hx0, y0, y1, zb, zh))
        if hx1 < x1 - 1e-6:
            boxes.append((hx1, x1, y0, y1, zb, zh))
        if hy0 > y0 + 1e-6:
            boxes.append((hx0, hx1, y0, hy0, zb, zh))
        if hy1 < y1 - 1e-6:
            boxes.append((hx0, hx1, hy1, y1, zb, zh))
    else:
        boxes.append((x0, x1, y0, y1, zb, zh))
    return boxes_object(nom, boxes, material, collection)


def build_stairs(collection):
    """Escalier droit le long de la façade droite (sous la trémie)."""
    hauteur_marche = ESC_HAUTEUR / (ESC_MARCHES + 1)
    boxes = []
    for i in range(ESC_MARCHES):
        y_haut = ESC_Y_BAS - i * ESC_GIRON
        z_haut = (i + 1) * hauteur_marche
        boxes.append((ESC_X0, ESC_X1, y_haut - ESC_GIRON, y_haut, 0.0, z_haut))
    boxes_object("Escalier_RDC", boxes, MATS["bois"], collection)

    # garde-corps simple côté couloir
    garde = []
    y = ESC_Y_BAS - ESC_GIRON * ESC_MARCHES
    while y < ESC_Y_BAS:
        z = (ESC_Y_BAS - y) / ESC_GIRON * hauteur_marche
        garde.append((ESC_X0 - 0.04, ESC_X0, y, y + 0.03, z, min(z + 1.0, z + 0.95)))
        y += 0.9
    boxes_object("Garde_corps", garde, MATS["menuiserie"], collection)


def build_roof(collection):
    demi = LARGEUR / 2.0
    pente = math.tan(PENTE_TOIT)
    z_faitage = Z_EGOUT + demi * pente
    z_egout_debord = Z_EGOUT - DEBORD_TOIT * pente

    y_a = -DEBORD_TOIT
    y_b = PROFONDEUR + DEBORD_TOIT
    x_g = -DEBORD_TOIT
    x_d = LARGEUR + DEBORD_TOIT

    verts = [
        (x_g, y_a, z_egout_debord), (demi, y_a, z_faitage),
        (demi, y_b, z_faitage), (x_g, y_b, z_egout_debord),
        (demi, y_a, z_faitage), (x_d, y_a, z_egout_debord),
        (x_d, y_b, z_egout_debord), (demi, y_b, z_faitage),
    ]
    faces = [(0, 1, 2, 3), (4, 5, 6, 7)]
    toit = mesh_object("Toiture", verts, faces, MATS["tuile"], collection)
    mod = toit.modifiers.new("Epaisseur", "SOLIDIFY")
    mod.thickness = EP_TOIT
    mod.offset = -1.0

    # faîtage
    boxes_object("Faitage", [
        (demi - 0.10, demi + 0.10, y_a, y_b, z_faitage - 0.04, z_faitage + 0.10)
    ], MATS["tuile"], collection)

    # pignons (murs montant jusqu'à la toiture, façades jardin et rue)
    for nom, y_face in (("Pignon_Jardin", 0.0), ("Pignon_Rue", PROFONDEUR - MUR_EXT)):
        profil = [(0.0, Z_EGOUT), (LARGEUR, Z_EGOUT), (demi, z_faitage)]
        ob = prism_object(nom, profil, "y", MUR_EXT, MATS["enduit"], collection)
        ob.location = (0.0, y_face, 0.0)

    # bandeau d'égout
    boxes_object("Bandeau_Egout_G", [
        (-DEBORD_TOIT, 0.0, y_a, y_b, Z_EGOUT - 0.22, Z_EGOUT)
    ], MATS["enduit"], collection)
    boxes_object("Bandeau_Egout_D", [
        (LARGEUR, x_d, y_a, y_b, Z_EGOUT - 0.22, Z_EGOUT)
    ], MATS["enduit"], collection)


# ---------------------------------------------------------------------------
# 6. RDC
# ---------------------------------------------------------------------------

MURS_RDC = [
    # --- murs extérieurs --------------------------------------------------
    ("Ext_Jardin", (0.00, 0.19), (LARGEUR, 0.19), MUR_EXT, [
        op(3.55, 3.50, 2.15, 0.0, "bay"),          # baie coulissante 3,50 x 2,15
    ], "enduit"),

    ("Ext_Rue", (0.00, 13.41), (LARGEUR, 13.41), MUR_EXT, [
        op(1.60, 1.20, 1.20, 1.00),                # fenêtre chambre 1
        op(5.50, 2.40, 2.00, 0.0, "garage"),       # porte de garage 2,40 x 2,00
    ], "enduit"),

    ("Ext_Gauche", (0.19, 0.00), (0.19, PROFONDEUR), MUR_EXT, [
        op(1.80, 1.80, 1.35, 0.95),                # séjour
        op(7.50, 1.20, 1.35, 0.95),                # séjour / cuisine
        op(9.90, 0.60, 0.60, 1.40),                # salle d'eau
    ], "enduit"),

    ("Ext_Droite", (6.91, 0.00), (6.91, PROFONDEUR), MUR_EXT, [
        op(1.80, 1.80, 1.35, 0.95),                # séjour
        op(5.00, 0.95, 2.10, 0.00, "door"),        # porte d'entrée
        op(6.80, 0.60, 0.60, 1.60),                # cellier
    ], "enduit"),

    # --- cloisons ---------------------------------------------------------
    ("Cloison_Entree", (4.30, 4.05), (4.30, 6.05), MUR_INT, [
        op(1.30, 0.90, 2.10, 0.0, "door"),         # entrée -> séjour
    ], "cloison"),

    ("Cloison_Entree_Cellier", (4.08, 6.10), (5.45, 6.10), MUR_INT, [
        op(0.72, 0.80, 2.10, 0.0, "door"),         # entrée -> cellier
    ], "cloison"),

    # mur bas sous l'escalier : ferme le cellier sans bloquer la volée
    ("Cloison_Sous_Escalier", (5.45, 6.10), (6.72, 6.10), MUR_INT, [],
     "cloison", 1.15),

    ("Cloison_Cellier_Garage", (3.95, 7.75), (6.72, 7.75), MUR_PORTEUR, [
        op(2.35, 0.80, 2.10, 0.0, "door"),         # cellier -> garage
    ], "cloison"),

    ("Cloison_Cellier_Sejour", (4.08, 6.15), (4.08, 7.65), MUR_INT, [],
     "cloison"),

    ("Mur_Garage", (4.05, 7.85), (4.05, Y1), MUR_PORTEUR, [], "cloison"),

    # APPROX : limite séjour / dégagement, recalée sur la surface du séjour
    ("Cloison_Sejour_Couloir", (0.38, 8.35), (3.95, 8.35), MUR_INT, [
        op(2.55, 0.90, 2.10, 0.0, "door"),
    ], "cloison"),

    ("Cloison_SalleEau", (2.25, 8.40), (2.25, 10.32), MUR_INT, [
        op(1.00, 0.70, 2.05, 0.0, "door"),
    ], "cloison"),

    ("Cloison_Chambre1", (0.38, 10.37), (3.95, 10.37), MUR_INT, [
        op(2.62, 0.90, 2.05, 0.0, "door"),
    ], "cloison"),
]

# Surfaces des pièces telles qu'annoncées sur le plan (libellés)
PIECES_RDC = [
    ("Piece_de_vie", "Pièce de vie\n42,68 m²", 2.10, 4.20),
    ("Entree", "Entrée\n4,99 m²", 5.50, 4.60),
    ("Cellier", "Cellier\n4,30 m²", 5.35, 6.90),
    ("Garage", "Garage\n14,23 m²", 5.45, 10.70),
    ("Salle_d_eau", "Salle d'eau\n3,78 m²", 1.25, 9.40),
    ("Chambre_1", "Chambre 1\n10,35 m²", 2.10, 11.85),
]


def build_rdc():
    col = COLS["rdc"]
    build_walls(MURS_RDC, 0.0, H_RDC, MATS["cloison"], col)

    # dalle du RDC (avec socle enterré)
    build_slab("Dalle_RDC", 0.0, LARGEUR, 0.0, PROFONDEUR, -0.26, 0.0,
               MATS["beton"], col)
    # revêtements
    boxes_object("Sol_Sejour", [
        (0.38, 6.72, 0.38, 8.35, 0.0, 0.02),
    ], MATS["sol_bois"], col)
    boxes_object("Sol_Pieces_Humides", [
        (0.38, 2.20, 8.40, 10.32, 0.0, 0.022),   # salle d'eau
        (4.35, 6.72, 4.05, 6.10, 0.0, 0.022),    # entrée
        (4.08, 6.72, 6.10, 7.65, 0.0, 0.020),    # cellier
        (2.30, 3.95, 8.40, 10.32, 0.0, 0.020),   # couloir
    ], MATS["carrelage"], col)
    boxes_object("Sol_Garage", [(4.15, 6.72, 7.85, 13.22, 0.0, 0.02)],
                 MATS["beton"], col)
    boxes_object("Sol_Chambre1", [(0.38, 3.95, 10.42, 13.22, 0.0, 0.02)],
                 MATS["sol_bois"], col)

    build_stairs(col)

    if BUILD_LABELS:
        for nom, texte, x, y in PIECES_RDC:
            label("LBL_RDC_" + nom, texte, x, y, 0.03, COLS["label_rdc"],
                  material=MATS["texte"])


# ---------------------------------------------------------------------------
# 7. ÉTAGE
# ---------------------------------------------------------------------------

MURS_ETAGE = [
    # --- murs extérieurs --------------------------------------------------
    ("Ext_Jardin_E", (0.00, 0.19), (LARGEUR, 0.19), MUR_EXT, [
        op(2.40, 1.20, 1.35, 0.95),                # chambre parentale
        op(5.30, 1.20, 1.35, 0.95),                # salle d'eau
    ], "enduit"),

    ("Ext_Rue_E", (0.00, 13.41), (LARGEUR, 13.41), MUR_EXT, [
        op(1.60, 1.20, 1.35, 0.95),                # chambre 3
        op(5.50, 1.20, 1.35, 0.95),                # chambre 2
    ], "enduit"),

    ("Ext_Gauche_E", (0.19, 0.00), (0.19, PROFONDEUR), MUR_EXT, [
        op(2.40, 1.20, 1.35, 0.95),                # chambre parentale
        op(6.80, 1.00, 1.35, 0.95),                # chambre 4
    ], "enduit"),

    ("Ext_Droite_E", (6.91, 0.00), (6.91, PROFONDEUR), MUR_EXT, [
        op(1.70, 0.60, 0.60, 1.45),                # salle d'eau étage
        op(8.60, 0.60, 0.60, 1.45),                # salle de bain
    ], "enduit"),

    # --- cloisons ---------------------------------------------------------
    ("Cloison_Parentale", (3.56, 0.38), (3.56, 4.43), MUR_INT, [
        op(3.55, 0.90, 2.05, 0.0, "door"),
    ], "cloison"),

    ("Cloison_Parentale_Sud", (0.38, 4.48), (3.56, 4.48), MUR_INT, [],
     "cloison"),

    ("Cloison_Chambre4_Est", (3.56, 4.53), (3.56, 7.90), MUR_INT, [],
     "cloison"),

    ("Cloison_Chambre4_Hall", (2.60, 7.90), (2.60, 8.80), MUR_INT, [
        op(0.45, 0.80, 2.05, 0.0, "door"),         # chambre 4 -> hall
    ], "cloison"),

    ("Cloison_Chambre4_Sud", (2.55, 7.90), (3.56, 7.90), MUR_INT, [],
     "cloison"),

    ("Cloison_Chambres_Sud", (0.38, 8.85), (6.72, 8.85), MUR_INT, [
        op(2.72, 0.90, 2.05, 0.0, "door"),         # chambre 3
        op(3.87, 0.90, 2.05, 0.0, "door"),         # chambre 2
    ], "cloison"),

    ("Cloison_SalleDeBain", (4.85, 6.70), (4.85, 8.80), MUR_INT, [
        op(1.65, 0.80, 2.05, 0.0, "door"),
    ], "cloison"),

    ("Cloison_SalleDeBain_Nord", (4.90, 6.70), (6.72, 6.70), MUR_INT, [],
     "cloison"),

    ("Cloison_Tremie_Ouest", (5.40, 4.00), (5.40, 6.65), MUR_INT, [],
     "cloison"),

    ("Cloison_Dressing_Sud", (4.80, 4.00), (6.72, 4.00), MUR_INT, [],
     "cloison"),

    ("Cloison_Dressing_Ouest", (4.80, 2.70), (4.80, 4.00), MUR_INT, [
        op(0.90, 0.80, 2.05, 0.0, "door"),
    ], "cloison"),

    ("Cloison_Dressing_SalleEau", (4.80, 2.70), (6.72, 2.70), MUR_INT, [],
     "cloison"),

    ("Cloison_SalleEau_Etage", (5.35, 0.38), (5.35, 2.70), MUR_INT, [
        op(1.65, 0.70, 2.05, 0.0, "door"),
    ], "cloison"),

    ("Cloison_Chambres_23", (3.56, 8.90), (3.56, Y1), MUR_INT, [],
     "cloison"),
]

PIECES_ETAGE = [
    ("Chambre_parentale", "Chambre parentale\n12,76 m²", 1.95, 2.40),
    ("Salle_d_eau", "Salle d'eau\n3,21 m²", 6.00, 1.50),
    ("Dressing", "Dressing\n3,86 m²", 5.78, 3.35),
    ("Degagement", "Dégagement\n10,95 m²", 4.25, 5.60),
    ("Chambre_4", "Chambre 4\n12,76 m²", 1.90, 6.20),
    ("Salle_de_bain", "Salle de bain + WC\n4,67 m²", 5.80, 7.75),
    ("Chambre_3", "Chambre 3\n13,28 m²", 1.95, 11.10),
    ("Chambre_2", "Chambre 2\n13,32 m²", 5.15, 11.10),
]


def build_etage():
    col = COLS["etage"]
    build_slab("Dalle_Etage", 0.0, LARGEUR, 0.0, PROFONDEUR,
               H_RDC, Z_ETAGE, MATS["beton"], col, trou=TREMIE)

    boxes_object("Sol_Etage", [
        (0.38, 6.72, 0.38, 8.80, Z_ETAGE, Z_ETAGE + 0.02),
    ], MATS["sol_etage"], col)
    boxes_object("Sol_Etage_Sud", [
        (0.38, 6.72, 8.85, 13.22, Z_ETAGE, Z_ETAGE + 0.02),
    ], MATS["sol_etage"], col)
    boxes_object("Sol_Etage_Carrelage", [
        (5.40, 6.72, 0.38, 2.70, Z_ETAGE, Z_ETAGE + 0.022),
        (4.90, 6.72, 6.70, 8.80, Z_ETAGE, Z_ETAGE + 0.022),
    ], MATS["carrelage"], col)

    build_walls(MURS_ETAGE, Z_ETAGE, H_ETAGE, MATS["cloison"], col)

    if BUILD_LABELS:
        for nom, texte, x, y in PIECES_ETAGE:
            label("LBL_E_" + nom, texte, x, y, Z_ETAGE + 0.03,
                  COLS["label_etage"], material=MATS["texte"])


# ---------------------------------------------------------------------------
# 8. MOBILIER (volumes simples, pour l'échelle)
# ---------------------------------------------------------------------------

def build_furniture():
    meubles = []

    def bloc(nom, x0, x1, y0, y1, z0, z1, materiau):
        col = COLS["mobilier_etage"] if z0 >= Z_ETAGE - 0.01 else COLS["mobilier_rdc"]
        ob = boxes_object(nom, [(x0, x1, y0, y1, z0, z1)], MATS[materiau], col)
        if ob:
            meubles.append(ob)

    z = 0.0
    # --- séjour / cuisine -------------------------------------------------
    bloc("Cuisine_Plan", 0.38, 1.00, 2.60, 6.40, z, z + 0.90, "bois")
    bloc("Cuisine_Ilot", 1.70, 2.90, 3.20, 5.20, z, z + 0.92, "bois")
    bloc("Canape", 0.55, 2.85, 0.55, 1.45, z, z + 0.72, "tissu")
    bloc("Canape_Retour", 0.55, 1.45, 0.55, 2.80, z, z + 0.72, "tissu")
    bloc("Table_Basse", 1.75, 2.60, 1.85, 2.55, z + 0.34, z + 0.40, "bois")
    bloc("Table_Manger", 3.90, 5.40, 1.00, 2.20, z + 0.70, z + 0.75, "bois")
    for i, (cx, cy) in enumerate(((4.10, 0.65), (5.20, 0.65), (4.10, 2.55), (5.20, 2.55))):
        bloc("Chaise_%d" % i, cx - 0.22, cx + 0.22, cy - 0.22, cy + 0.22,
             z, z + 0.45, "bois")

    # --- chambre 1 --------------------------------------------------------
    bloc("Lit_Ch1", 0.55, 1.95, 11.10, 13.00, z, z + 0.52, "textile_blanc")
    bloc("Tete_Lit_Ch1", 0.55, 1.95, 12.92, 13.02, z, z + 1.00, "bois")
    bloc("Armoire_Ch1", 2.90, 3.90, 12.25, 12.85, z, z + 2.10, "bois")

    # --- salle d'eau RDC --------------------------------------------------
    bloc("Douche_RDC", 0.42, 1.40, 8.44, 9.42, z, z + 0.06, "carrelage")
    bloc("Vasque_RDC", 0.42, 1.30, 9.95, 10.28, z + 0.82, z + 0.90, "menuiserie")

    # --- cellier / garage -------------------------------------------------
    bloc("Etagere_Cellier", 4.12, 4.60, 6.20, 7.55, z, z + 1.90, "bois")

    z = Z_ETAGE
    # --- chambre parentale ------------------------------------------------
    bloc("Lit_Parental", 0.60, 2.20, 1.90, 4.00, z, z + 0.52, "textile_blanc")
    bloc("Tete_Parental", 0.60, 2.20, 0.62, 0.72, z, z + 1.00, "bois")
    bloc("Armoire_Parentale", 2.60, 3.45, 0.45, 1.90, z, z + 2.00, "bois")

    # --- dressing ---------------------------------------------------------
    bloc("Dressing_Meuble", 5.55, 6.65, 2.80, 3.80, z, z + 1.85, "bois")
    bloc("Dressing_Penderie", 4.90, 6.65, 2.78, 2.98, z, z + 1.85, "bois")

    # --- chambre 4 --------------------------------------------------------
    bloc("Lit_Ch4", 0.60, 2.00, 5.30, 7.30, z, z + 0.52, "textile_blanc")
    bloc("Armoire_Ch4", 2.85, 3.45, 4.60, 5.90, z, z + 2.00, "bois")

    # --- chambres 3 et 2 --------------------------------------------------
    bloc("Lit_Ch3", 0.60, 2.20, 10.60, 12.60, z, z + 0.52, "textile_blanc")
    bloc("Armoire_Ch3", 2.85, 3.45, 9.00, 10.30, z, z + 2.00, "bois")
    bloc("Lit_Ch2", 4.10, 5.50, 10.60, 12.60, z, z + 0.52, "textile_blanc")
    bloc("Armoire_Ch2", 6.10, 6.65, 9.00, 10.30, z, z + 2.00, "bois")

    # --- salle de bain étage ---------------------------------------------
    bloc("Baignoire", 4.95, 6.60, 6.80, 7.60, z, z + 0.55, "carrelage")
    bloc("Vasque_Etage", 6.05, 6.65, 8.10, 8.70, z + 0.80, z + 0.88, "menuiserie")
    bloc("WC_Etage", 4.95, 5.35, 8.20, 8.65, z, z + 0.42, "menuiserie")

    # --- salle d'eau étage ------------------------------------------------
    bloc("Douche_Etage", 5.95, 6.65, 0.45, 1.55, z, z + 0.06, "carrelage")
    bloc("Vasque_SDE", 5.45, 5.90, 0.50, 1.40, z + 0.80, z + 0.88, "menuiserie")


# ---------------------------------------------------------------------------
# 9. EXTÉRIEUR
# ---------------------------------------------------------------------------

def build_site():
    col = COLS["site"]
    boxes_object("Terrain", [(-22.0, 29.0, -20.0, 34.0, -0.30, -0.26)],
                 MATS["gazon"], col)
    boxes_object("Rue_Paves", [(-4.0, 11.0, PROFONDEUR + 0.2, PROFONDEUR + 9.0,
                                -0.28, -0.22)], MATS["pave"], col)

    # terrasse bois devant la baie du séjour
    lames = []
    x = -1.60
    while x < 5.30:
        lames.append((x, x + 0.115, -3.90, 0.00, -0.10, -0.03))
        x += 0.135
    boxes_object("Terrasse_Bois", lames, MATS["terrasse"], col)
    boxes_object("Seuil_Garage", [(3.90, 6.85, PROFONDEUR, PROFONDEUR + 1.6,
                                   -0.24, -0.20)], MATS["pave"], col)


# ---------------------------------------------------------------------------
# 10. IMAGES DE RÉFÉRENCE (galerie en fond de scène)
# ---------------------------------------------------------------------------

def build_references():
    dossier = os.path.join(dossier_script(), "references")
    if not os.path.isdir(dossier):
        print("[casa-renous] pas de dossier references/, galerie ignorée")
        return
    extensions = (".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff")
    fichiers = sorted(f for f in os.listdir(dossier)
                      if f.lower().endswith(extensions))
    if not fichiers:
        return

    col = COLS["reperes"]
    largeur = 2.20
    pas = 2.55
    x = -pas * (len(fichiers) - 1) / 2.0
    y = -18.0

    for nom in fichiers:
        chemin = os.path.join(dossier, nom)
        try:
            img = bpy.data.images.load(chemin, check_existing=True)
        except RuntimeError:
            print("[casa-renous] image illisible :", chemin)
            continue
        ratio = 1.0
        if img.size and img.size[0]:
            ratio = img.size[1] / img.size[0]
        h = largeur * ratio
        verts = [(-largeur / 2, 0, 0), (largeur / 2, 0, 0),
                 (largeur / 2, 0, h), (-largeur / 2, 0, h)]
        faces = [(0, 1, 2, 3)]
        me = bpy.data.meshes.new("PHOTO_" + nom)
        me.from_pydata(verts, [], faces)
        me.update()
        uv = me.uv_layers.new(name="UVMap")
        for i, coord in enumerate(((0, 0), (1, 0), (1, 1), (0, 1))):
            uv.data[i].uv = coord
        ob = bpy.data.objects.new("PHOTO_" + nom, me)
        ob.location = (x, y, 0.10)
        col.objects.link(ob)

        mat = bpy.data.materials.new("M_Photo_" + nom)
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            if n.type == "BSDF_PRINCIPLED":
                nt.nodes.remove(n)
        emission = nt.nodes.new("ShaderNodeEmission")
        texture = nt.nodes.new("ShaderNodeTexImage")
        texture.image = img
        sortie = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(texture.outputs["Color"], emission.inputs["Color"])
        nt.links.new(emission.outputs["Emission"], sortie.inputs["Surface"])
        emission.inputs["Strength"].default_value = 1.0
        me.materials.append(mat)

        x += pas


# ---------------------------------------------------------------------------
# 11. CAMÉRAS, LUMIÈRES, RENDU
# ---------------------------------------------------------------------------

def look_at(ob, cible):
    dx = cible[0] - ob.location[0]
    dy = cible[1] - ob.location[1]
    dz = cible[2] - ob.location[2]
    distance = math.hypot(dx, dy)
    elevation = math.atan2(dz, distance) if distance > 1e-9 else 0.0
    ob.rotation_euler = (math.pi / 2.0 + elevation, 0.0, math.atan2(-dx, dy))


def add_camera(nom, position, cible, focale=35.0, ortho=None):
    data = bpy.data.cameras.new(nom)
    data.lens = focale
    if ortho is not None:
        data.type = "ORTHO"
        data.ortho_scale = ortho
    data.clip_end = 400.0
    ob = bpy.data.objects.new(nom, data)
    ob.location = position
    COLS["camera"].objects.link(ob)
    look_at(ob, cible)
    return ob


def setup_scene_lighting():
    scene = bpy.context.scene

    monde = bpy.data.worlds.new("Ciel")
    monde.use_nodes = True
    fond = monde.node_tree.nodes.get("Background")
    if fond is not None:
        fond.inputs[0].default_value = (0.52, 0.66, 0.85, 1.0)
        fond.inputs[1].default_value = 1.1
    scene.world = monde

    data = bpy.data.lights.new("Soleil", type="SUN")
    data.energy = 4.0
    data.angle = math.radians(3.0)
    data.color = (1.0, 0.97, 0.92)
    soleil = bpy.data.objects.new("Soleil", data)
    soleil.location = (12.0, -18.0, 22.0)
    look_at(soleil, (3.5, 6.8, 0.0))
    COLS["camera"].objects.link(soleil)

    data = bpy.data.lights.new("Appoint", type="AREA")
    data.energy = 900.0
    data.size = 8.0
    appoint = bpy.data.objects.new("Appoint", data)
    appoint.location = (18.0, 14.0, 9.0)
    look_at(appoint, (3.5, 6.8, 2.0))
    COLS["camera"].objects.link(appoint)

    add_camera("CAM_01_Facade_Jardin", (12.5, -12.0, 6.8), (2.6, 3.0, 2.6), 35.0)
    add_camera("CAM_02_Facade_Rue", (13.5, 24.0, 7.0), (3.0, 9.0, 2.8), 35.0)
    add_camera("CAM_03_Sejour", (1.05, 1.10, 1.65), (5.4, 5.2, 1.30), 22.0)
    add_camera("CAM_04_Plan_RDC", (LARGEUR / 2, PROFONDEUR / 2, 34.0),
               (LARGEUR / 2, PROFONDEUR / 2, 0.0), ortho=17.5)
    add_camera("CAM_05_Plan_Etage", (LARGEUR / 2, PROFONDEUR / 2, 34.0),
               (LARGEUR / 2, PROFONDEUR / 2, 0.0), ortho=17.5)


def setup_render():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.length_unit = "METERS"
    for moteur in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = moteur
            break
        except TypeError:
            continue
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(dossier_script(), "renders", "casa_renous")
    try:
        scene.eevee.taa_render_samples = 96
    except AttributeError:
        pass
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.camera = bpy.data.objects.get("CAM_01_Facade_Jardin")


# ---------------------------------------------------------------------------
# 12. UTILITAIRE : afficher un niveau (rendu de plan)
# ---------------------------------------------------------------------------

def show_floor(niveau="rdc"):
    """Masque/affiche les collections pour un rendu de plan.

    niveau : "rdc", "etage" ou "tout".
    """
    etats = {
        "rdc": {"etage": True, "toit": True,
                "mobilier_rdc": False, "mobilier_etage": True,
                "label_rdc": False, "label_etage": True},
        "etage": {"etage": False, "toit": True,
                  "mobilier_rdc": True, "mobilier_etage": False,
                  "label_rdc": True, "label_etage": False},
        "tout": {"etage": False, "toit": False,
                 "mobilier_rdc": False, "mobilier_etage": False,
                 "label_rdc": False, "label_etage": False},
    }
    for nom, cache in etats[niveau].items():
        col = COLS[nom]
        col.hide_viewport = cache
        col.hide_render = cache
    cam = bpy.data.objects.get("CAM_04_Plan_RDC" if niveau == "rdc"
                               else "CAM_05_Plan_Etage")
    if cam is not None and niveau != "tout":
        bpy.context.scene.camera = cam


# ---------------------------------------------------------------------------
# 13. EXÉCUTION
# ---------------------------------------------------------------------------

def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)
    for bloc in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras,
                 bpy.data.lights, bpy.data.curves, bpy.data.images):
        for datablock in list(bloc):
            if datablock.users == 0:
                try:
                    bloc.remove(datablock)
                except (RuntimeError, ReferenceError):
                    pass


def main():
    if CLEAR_SCENE:
        reset_scene()

    setup_materials()
    setup_collections()

    build_rdc()
    build_etage()
    build_roof(COLS["toit"])
    if BUILD_SITE:
        build_site()
    if BUILD_FURNITURE:
        build_furniture()
    if BUILD_REFERENCES:
        build_references()

    setup_scene_lighting()
    setup_render()

    bpy.context.scene.frame_set(1)
    try:
        bpy.context.view_layer.update()
    except AttributeError:
        pass

    print("[casa-renous] modèle construit : %d objets" % len(bpy.data.objects))

    if RENDER_PREVIEWS:
        render_previews()

    if SAVE_BLEND and bpy.app.background:
        chemin = os.path.join(dossier_script(), "casa_renous.blend")
        bpy.ops.wm.save_as_mainfile(filepath=chemin)
        print("[casa-renous] fichier enregistré :", chemin)


def render_previews():
    """Rend les caméras de présentation (Cycles, pour fonctionner en --background)."""
    scene = bpy.context.scene
    dossier = os.path.join(dossier_script(), "renders")
    if not os.path.isdir(dossier):
        os.makedirs(dossier)
    try:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = 64
    except (TypeError, AttributeError):
        pass
    for nom in ("CAM_01_Facade_Jardin", "CAM_02_Facade_Rue", "CAM_03_Sejour",
                "CAM_04_Plan_RDC", "CAM_05_Plan_Etage"):
        cam = bpy.data.objects.get(nom)
        if cam is None:
            continue
        if nom == "CAM_04_Plan_RDC":
            show_floor("rdc")
        elif nom == "CAM_05_Plan_Etage":
            show_floor("etage")
        else:
            show_floor("tout")
        scene.camera = cam
        scene.render.filepath = os.path.join(dossier, nom.lower() + ".png")
        bpy.ops.render.render(write_still=True)
        print("[casa-renous] rendu :", scene.render.filepath)
    show_floor("tout")


if __name__ == "__main__":
    main()

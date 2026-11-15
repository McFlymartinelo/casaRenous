# Casa Renous — maquette Blender des plans

Script Python qui reconstruit la maison (RDC + étage) dans Blender à partir des
plans de Maisons Belles Demeures, et qui affiche les images de référence dans la
scène.

```
blender/
├─ casa_renous.py        # le script (seul fichier indispensable)
├─ references/           # photos des plans / visuels à déposer ici
└─ README.md
```

## Utilisation

### 1. Depuis Blender (le plus simple)

1. Ouvrir Blender, `Scripting` > `Open` > `blender/casa_renous.py`
2. `Run Script` (`Alt+P`)

La scène courante est vidée puis reconstruite. **Sauvegardez avant** si le
fichier contient déjà du travail (`CLEAR_SCENE = True` en tête de script).

### 2. En ligne de commande

```bash
blender --background --python blender/casa_renous.py
```

Le script génère aussi `blender/casa_renous.blend`, directement ouvrable.

### 3. Rendu des vues

Le fichier contient 5 caméras :

| Caméra | Vue |
| --- | --- |
| `CAM_01_Facade_Jardin` | perspective 3/4 côté jardin / terrasse |
| `CAM_02_Facade_Rue` | perspective 3/4 côté rue / garage |
| `CAM_03_Sejour` | vue intérieure du séjour vers l'entrée |
| `CAM_04_Plan_RDC` | orthographique, à-plat du RDC |
| `CAM_05_Plan_Etage` | orthographique, à-plat de l'étage |

Pour un rendu de plan lisible, masquer les niveaux supérieurs : dans la
console Python de Blender, `show_floor("rdc")` ou `show_floor("etage")`
(`show_floor("tout")` remet tout en place). La fonction masque l'étage, la
toiture et le mobilier des autres niveaux, et bascule sur la caméra de plan.

Pour tout rendre d'un coup en ligne de commande : passer
`RENDER_PREVIEWS = True` en tête du script (bascule en Cycles, c'est long).

## Ce que construit le script

* volume 7,10 × 13,60 m, murs extérieurs de 0,38 m (6,34 m intérieurs, cote du plan),
* hauteur 2,60 m au RDC, 2,85 m à l'étage, toit à deux pans à 28° avec débords,
* toutes les ouvertures lues sur les plans (baie 3,50 × 2,15, porte de garage
  2,40 × 2,00, fenêtres 1,20 ou 1,80, 0,60 en sanitaires…),
* cloisons des deux niveaux, dalles, escalier droit et sa trémie,
* mobilier sommaire (cuisine, séjour, lits, sanitaires) pour l'échelle,
* une étiquette par pièce avec le nom et la surface du plan,
* terrasse bois, pavés de la rue, gazon,
* une galerie des photos déposées dans `references/`.

Collections de la scène :

```
00_Reperes            photos de référence (galerie)
01_RDC                murs, sols, escalier du rez-de-chaussée
02_Etage              niveau 1 et sa dalle
03_Toiture            couverture, faîtage, pignons
04_Exterieur          terrain, terrasse, pavés
05_Mobilier_RDC       meubles du rez-de-chaussée
05_Mobilier_Etage     meubles de l'étage
06_Cameras_Lumieres   caméras, soleil, lumière d'appoint
07_Etiquettes_RDC     étiquettes des pièces (nom + surface)
07_Etiquettes_Etage   étiquettes de l'étage
```

## Images de référence

Déposer les photos (plans, visuels de façade) dans `blender/references/` :
elles sont chargées automatiquement et présentées en galerie verticale à
l'arrière de la scène, à `y = -18`. Formats acceptés : png, jpg, jpeg, webp, tif.

Le script fonctionne aussi sans ce dossier (la galerie est simplement ignorée).

## Personnaliser

Tout est piloté par des listes lisibles en haut du fichier :

```python
LARGEUR, PROFONDEUR = 7.10, 13.60   # cotes extérieures
H_RDC, H_ETAGE      = 2.60, 2.50
PENTE_TOIT          = math.radians(28)
```

Chaque mur est une entrée de `MURS_RDC` / `MURS_ETAGE` :

```python
("Ext_Gauche", (0.19, 0.00), (0.19, PROFONDEUR), MUR_EXT, [
    op(1.80, 1.80, 1.35, 0.95),      # fenêtre : centre 1,80 m, 1,80 × 1,35, allège 0,95
    op(7.50, 1.20, 1.35, 0.95),
], "enduit"),
```

`op(centre_depuis_le_début_du_mur, largeur, hauteur, allège, type)` avec
`type` ∈ `window`, `door`, `bay`, `garage`. Le 7e élément optionnel du tuple
est une hauteur de mur spécifique (utilisé pour le mur bas sous l'escalier).

Le script prévient dans la console si une ouverture dépasse la longueur de son mur.

## Précision du modèle

Les cotes lues sur les plans sont respectées : 7,10 / 13,60 / 6,34 m, les
ouvertures de façade et les surfaces annoncées des pièces.

En revanche, la position exacte de quelques cloisons intérieures est une
reconstitution (une photo de plan ne donne pas les épaisseurs réelles). Les
écarts restent inférieurs à quelques dizaines de centimètres, et chaque mur se
corrige en une ligne. Points volontairement simplifiés :

* l'escalier est droit (le plan utilise des marches gironnées) ;
* le WC de l'étage est regroupé avec la salle de bain ;
* le dressing de l'étage est plus compact que sur le plan ;
* le cellier est fermé par un muret bas sous la volée d'escalier.

## Export pour le portail

`apps/portal/public/models/` est prévu pour un `.glb` : dans Blender,
`File > Export > glTF 2.0`, format `glTF Binary (.glb)`, puis enregistrer
`casa_renous.glb` dans ce dossier.

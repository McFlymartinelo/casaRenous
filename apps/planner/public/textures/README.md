# Textures

Déposez ici vos textures PBR (`.jpg`, `.png`, `.webp`) si vous ne voulez pas
utiliser les textures procédurales générées par l'application.

Exemple d'arborescence :

```text
public/textures/
├─ chene/
│  ├─ albedo.jpg
│  ├─ normal.jpg
│  └─ roughness.jpg
└─ zellige/
   ├─ albedo.jpg
   └─ normal.jpg
```

Puis référencez-les dans une matière de `src/config/house.json` :

```json
"textures": {
  "map": "/textures/chene/albedo.jpg",
  "normalMap": "/textures/chene/normal.jpg",
  "roughnessMap": "/textures/chene/roughness.jpg"
}
```

Les chemins sont relatifs à `public/`. Le toggle **Textures PBR** de
l'inspecteur désactive les maps sans casser les couleurs ni les collisions.

Les textures fournies par défaut sont générées dans le navigateur par
`src/lib/textures.ts` (bois, tuile, enduit, béton, pierre, tissu, herbe).

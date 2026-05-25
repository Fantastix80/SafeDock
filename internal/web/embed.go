package web

import "embed"

// StaticFiles contient l'ensemble des ressources statiques du tableau de bord (HTML, CSS, JS).
// Les fichiers sont lus à la compilation et injectés directement dans le binaire.
//go:embed static/*
var StaticFiles embed.FS

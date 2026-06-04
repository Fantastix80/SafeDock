// Package cleanup est réservé à de futurs mécanismes de nettoyage globaux.
// Le nettoyage des images de staging est désormais géré directement par
// le deployer (internal/deployer/lifecycle.go) immédiatement après chaque
// pipeline SecOps, sans goroutine d'arrière-plan.
package cleanup

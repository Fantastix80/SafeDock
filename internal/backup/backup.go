// Package backup produit des sauvegardes cohérentes de la base SQLite de SafeDock.
//
// Une sauvegarde est un instantané écrit via `VACUUM INTO` (et non une copie
// brute du fichier, qui pourrait être incohérente pendant une écriture). Les
// fichiers sont stockés dans un sous-dossier « backups » à côté de la base, donc
// persistés avec le volume de données. Seul un administrateur peut les créer,
// lister, télécharger ou supprimer (voir internal/api).
package backup

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/safedock/safedock/internal/db"
)

const subdir = "backups"

// nameRe valide un nom de sauvegarde : safedock-AAAAMMJJ-HHMMSS.db (+ suffixe
// optionnel pour désambiguïser les sauvegardes manuelles d'une même seconde).
var nameRe = regexp.MustCompile(`^safedock-\d{8}-\d{6}(-\d+)?\.db$`)

// Info décrit une sauvegarde présente sur le disque.
type Info struct {
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	CreatedAt string `json:"created_at"` // RFC3339 (UTC), dérivé du nom de fichier
}

// Dir retourne (et crée si besoin) le dossier des sauvegardes.
func Dir() (string, error) {
	d := filepath.Join(db.DBDir(), subdir)
	if err := os.MkdirAll(d, 0750); err != nil {
		return "", err
	}
	return d, nil
}

// Create génère une nouvelle sauvegarde horodatée et retourne ses métadonnées.
func Create(now time.Time) (Info, error) {
	conn := db.GetDB()
	if conn == nil {
		return Info{}, fmt.Errorf("base de données non initialisée")
	}
	d, err := Dir()
	if err != nil {
		return Info{}, err
	}
	stamp := now.UTC().Format("20060102-150405")
	name := "safedock-" + stamp + ".db"
	target := filepath.Join(d, name)
	// VACUUM INTO échoue si le fichier existe : on désambiguïse les collisions
	// (sauvegardes manuelles dans la même seconde) par un suffixe incrémental.
	for i := 1; ; i++ {
		if _, statErr := os.Stat(target); os.IsNotExist(statErr) {
			break
		}
		name = fmt.Sprintf("safedock-%s-%d.db", stamp, i)
		target = filepath.Join(d, name)
	}
	if _, err := conn.Exec("VACUUM INTO ?", target); err != nil {
		return Info{}, fmt.Errorf("échec de la sauvegarde (VACUUM INTO) : %w", err)
	}
	_ = os.Chmod(target, 0600)
	var size int64
	if fi, serr := os.Stat(target); serr == nil {
		size = fi.Size()
	}
	return Info{Name: name, Size: size, CreatedAt: parseStamp(name)}, nil
}

// List retourne les sauvegardes existantes, la plus récente en premier.
func List() ([]Info, error) {
	d, err := Dir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(d)
	if err != nil {
		return nil, err
	}
	type rec struct {
		info Info
		mod  time.Time
	}
	recs := make([]rec, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() || !nameRe.MatchString(e.Name()) {
			continue
		}
		fi, ierr := e.Info()
		if ierr != nil {
			continue
		}
		recs = append(recs, rec{
			info: Info{Name: e.Name(), Size: fi.Size(), CreatedAt: parseStamp(e.Name())},
			mod:  fi.ModTime(),
		})
	}
	// Tri par date de création réelle (mtime), la plus récente d'abord — robuste
	// quelle que soit la convention de nommage. En cas d'égalité (même seconde),
	// le suffixe de désambiguïsation départage (-N le plus élevé = le plus récent).
	sort.Slice(recs, func(i, j int) bool {
		if !recs[i].mod.Equal(recs[j].mod) {
			return recs[i].mod.After(recs[j].mod)
		}
		if si, sj := suffixNum(recs[i].info.Name), suffixNum(recs[j].info.Name); si != sj {
			return si > sj
		}
		return recs[i].info.Name > recs[j].info.Name // déterministe
	})
	out := make([]Info, len(recs))
	for i, r := range recs {
		out[i] = r.info
	}
	return out, nil
}

// suffixNum extrait le numéro de désambiguïsation « -N » d'un nom (0 si absent).
func suffixNum(name string) int {
	core := strings.TrimSuffix(strings.TrimPrefix(name, "safedock-"), ".db")
	if parts := strings.Split(core, "-"); len(parts) == 3 {
		if n, err := strconv.Atoi(parts[2]); err == nil {
			return n
		}
	}
	return 0
}

// Prune ne conserve que les `keep` sauvegardes les plus récentes (0 = illimité).
// Retourne le nombre de fichiers supprimés.
func Prune(keep int) (int, error) {
	if keep <= 0 {
		return 0, nil
	}
	list, err := List()
	if err != nil {
		return 0, err
	}
	removed := 0
	for i, b := range list {
		if i < keep {
			continue
		}
		if derr := Delete(b.Name); derr == nil {
			removed++
		}
	}
	return removed, nil
}

// Path renvoie le chemin absolu d'une sauvegarde après validation stricte du nom
// (protection contre la traversée de répertoire).
func Path(name string) (string, error) {
	if !nameRe.MatchString(name) {
		return "", fmt.Errorf("nom de sauvegarde invalide")
	}
	d, err := Dir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(d, name)
	if filepath.Dir(p) != d {
		return "", fmt.Errorf("chemin de sauvegarde invalide")
	}
	if _, serr := os.Stat(p); serr != nil {
		return "", serr
	}
	return p, nil
}

// Delete supprime une sauvegarde (nom validé).
func Delete(name string) error {
	p, err := Path(name)
	if err != nil {
		return err
	}
	return os.Remove(p)
}

// parseStamp dérive l'horodatage RFC3339 (UTC) à partir du nom de fichier.
func parseStamp(name string) string {
	core := strings.TrimSuffix(strings.TrimPrefix(name, "safedock-"), ".db")
	if i := strings.LastIndex(core, "-"); strings.Count(core, "-") > 1 && i > 0 {
		core = core[:i] // retire un éventuel suffixe de désambiguïsation
	}
	t, err := time.Parse("20060102-150405", core)
	if err != nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

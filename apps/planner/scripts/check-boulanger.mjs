/**
 * Vérifie gratuitement si le endpoint Boulanger d'API.SH est rétabli.
 * Interroge la page de statut publique (aucune clé, aucun crédit consommé).
 *
 * Usage : node scripts/check-boulanger.mjs
 * Affiche simplement l'état (aucun code d'erreur, pour rester lisible dans npm).
 */

const STATUS_URL = "https://status.api.sh/api/public/status"

try {
  const response = await fetch(STATUS_URL)
  if (!response.ok) throw new Error(`Statut API.SH ${response.status}`)
  const data = await response.json()

  const incidents = (data.incidents ?? []).filter((incident) =>
    (incident.routes ?? []).includes("/boulanger/v1/product"),
  )
  const ongoing = incidents.filter((incident) => !incident.resolved_at)

  if (ongoing.length) {
    const current = ongoing[0]
    console.log("Boulanger : INDISPONIBLE")
    console.log(`Incident : ${current.title}`)
    console.log(`Début : ${current.started_at}`)
    console.log(`Dernière mise à jour : ${current.updated_at}`)
    console.log(`Détail : ${current.updates?.[0]?.body ?? ""}`)
    console.log("Surveille https://status.api.sh/history — aucun changement de code nécessaire.")
  } else {
    console.log("Boulanger : disponible (aucun incident en cours)")
    console.log("Relance : npm run import:boulanger")
  }
} catch (error) {
  console.error(`Impossible de vérifier le statut : ${error.message}`)
  process.exitCode = 1
}

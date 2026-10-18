# Pi pizza and Burgers — Tlemcen · site de démonstration + tableau de bord

Maquette réalisée par Younes (web designer, Tlemcen). **Site non officiel**, à faire valider par la pizzeria. Pied de page : « Maquette de démonstration ».

- Site : https://sayler991.github.io/Pi_Pizza_site/
- Espace gérant : https://sayler991.github.io/Pi_Pizza_site/admin/ (compte propriétaire : table partagée `public.owners`, benduy0@gmail.com)

## Faits réels (sources : `/workspace/pipizza_real/SOURCES.md`, relevés le 18/10/2026)
- Nom « Pi pizza and Burgers », pizzeria, VMGQ+2F2, boulevard 24 mètres, Tlemcen — tél. 0550 49 71 22 (Google Maps).
- 4,8★ / 25 avis Google ; 4 avis cités mot pour mot avec date (auteurs non publiés par la source → affichés « Avis Google 5★ »).
- Enseigne : π bleu marine « PIZZA & BURGER », portes rouges, façade crème, plaque « πZZERIA » → palette du site.

## Provisoire / à compléter avec le gérant
- **Carte et prix : aucun publié.** 2 articles génériques « Pizza » et « Burger » (déduits du nom de l’enseigne), **prix à venir** ; commandables, le client précise dans la remarque, total « à confirmer ». Les prix saisis dans l’admin deviennent aussitôt les prix serveur.
- Horaires non publiés. Pas d’Instagram/Facebook/TikTok trouvé. WhatsApp : lien wa.me vers le 0550 49 71 22 (usage WhatsApp non vérifié).
- Livraison proposée « zone, délai et frais à confirmer ». Logo : recréation SVG simplifiée de l’enseigne.

## Photos
Réelles (Google Maps, non retouchées, sans filigrane) : `facade` (façade complète), `sign` (recadrage de la plaque πZZERIA de la même photo).
Illustrations Pexels (licence libre, légendées « Illustration ») :
| clé | sujet | auteur | lien |
|---|---|---|---|
| pizza | pizzas mozzarella-basilic vues de dessus | Vincent Rivaud | https://www.pexels.com/photo/top-view-photo-of-baked-pizza-2147491/ |
| burger | burger garni | Thomas Mertens | https://www.pexels.com/photo/delicious-american-burger-15007048/ |
Polices : Bricolage Grotesque + DM Sans (SIL OFL).

## Technique
Même base que Best Kebab : `live.js` (panier +/−, tiroir, remarques, emporter/livraison, RPC `pipizza.place_order` avec prix recalculés serveur, repli WhatsApp/téléphone), `/admin/` (CMS, commandes, clients, stats, alertes 30 s + son + bannière + notifications).
Supabase `rvreusugrtiubqtafgbk`, schéma `pipizza` (`supabase/schema.sql`, `seed.sql`), RLS identique, ajouté aux schémas exposés (liste conservée).

# Notes de Frais PWA

Application mobile (iPhone) pour capturer et gérer les notes de frais avec analyse IA des tickets.

## Fonctionnalités
- 📷 Photo du ticket → analyse automatique par Gemini 2.0 Flash (gratuit)
- 📊 Génération du fichier Excel au format CFF-Lyon exact
- 📅 Gestion par mois automatique (date du ticket)
- 📤 Export Excel + envoi mail en fin de mois
- 📵 Fonctionne hors-ligne (PWA)

## Déploiement sur iPhone

### Option 1 : GitHub Pages (recommandé)
1. Crée un repo GitHub (ex: `ndf-app`)
2. Upload tous les fichiers dans ce dossier
3. Active GitHub Pages : Settings → Pages → Branch: main
4. Sur iPhone : ouvre l'URL GitHub Pages dans Safari
5. Partager → "Sur l'écran d'accueil" pour installer comme app

### Option 2 : Hébergement local (MacBook)
```bash
# Installe un serveur simple
npm install -g serve

# Lance le serveur
cd ndf-app
serve -l 3000

# Sur iPhone, ouvre : http://[IP-MacBook]:3000
# (les deux appareils doivent être sur le même WiFi)
```

### Option 3 : Via Raspberry Pi + Tailscale
```bash
# Sur le Raspberry Pi
cp -r ndf-app /home/pi/
cd /home/pi/ndf-app
python3 -m http.server 8080

# Accessible via Tailscale depuis l'iPhone
# http://[IP-Tailscale-RPi]:8080
```

## Configuration (première utilisation)

1. Ouvre l'app → bouton ⚙️
2. **Clé API Gemini** : va sur https://aistudio.google.com → Get API Key → copie la clé
3. **Email destinataire** : adresse compta Bouché
4. **Votre email** : ton adresse professionnelle
5. **Nom** : ton nom complet

## Utilisation quotidienne

1. Appuie sur **+** pour ajouter un ticket
2. Prends la photo (ou sélectionne dans la galerie)
3. Appuie sur **Analyser** → l'IA extrait date, libellé, montant
4. Vérifie et corrige si besoin → **Sauvegarder**
5. En fin de mois : bouton **📤** → Télécharger ou Envoyer par mail

## Structure du fichier Excel généré
- Remplace automatiquement XmoisX et XannéeX
- Colonnes : Date | Libellé | Kms | Repas | Hotel | Taxis | Divers
- Lignes 15-41 : données (max 27 tickets/mois)
- Totaux et formules identiques au modèle original

## Limites
- Max 27 tickets par mois (lignes 15 à 41 du template)
- Nécessite internet pour l'analyse IA (Gemini)
- L'envoi mail ouvre le client mail natif avec le corps pré-rempli — il faut attacher manuellement le fichier Excel téléchargé

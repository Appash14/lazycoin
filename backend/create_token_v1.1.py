#!/usr/bin/env python3
import os
import sys
import subprocess
import json
import time
import requests
import re
import argparse
import threading
import queue

# Configuration - Définition du mot de passe sudo au début
def set_sudo_password():
    try:
        # Essayer de lire le mot de passe depuis une variable d'environnement
        sudo_password = os.environ.get('SUDO_PASSWORD', '')
        return sudo_password
    except Exception as e:
        log_debug(f"Erreur lors de la lecture du mot de passe sudo: {str(e)}")
        return '123'  # Mot de passe par défaut

# Initialisation du mot de passe sudo
sudo_password = set_sudo_password()

def log_progress(message, percentage=None, language='en'):
    """Envoie un message de progression au frontend dans la langue spécifiée"""
    messages = {
        'fr': {
            "🚀 Starting token creation...": "🚀 Démarrage de la création du token...",
            "⚙️ Configuring Solana environment...": "⚙️ Configuration de l'environnement Solana...",
            "💰 Checking wallet balance...": "💰 Vérification du solde du wallet...",
            "🚰 Requesting SOL airdrop...": "🚰 Demande d'airdrop SOL...",
            "🔨 Creating token on blockchain...": "🔨 Création du token sur la blockchain...",
            "🔑 Token address generated": "🔑 Adresse du token générée",
            "💼 Creating token account...": "💼 Création du compte token...",
            "💎 Minting tokens...": "💎 Mint des tokens en cours...",
            "📋 Configuring metadata...": "📋 Configuration des métadonnées...",
            "🔒 Disabling mint...": "🔒 Désactivation du mint...",
            "✨ Finalizing token creation...": "✨ Finalisation de la création...",
            "✅ Token successfully created!": "✅ Token créé avec succès !",
            "🔍 Searching for custom address...": "🔍 Recherche d'adresse personnalisée...",
            "🔍 Continuing custom address search...": "🔍 Recherche approfondie d'adresse personnalisée...",
            "Maximum attempts reached": "Analyse terminée - Adresse non trouvée",
            "🚀 Creating token with custom address...": "🚀 Création du token avec adresse personnalisée..."
            # Ajouter d'autres traductions au besoin
        }
    }
    
    # Si la langue est française, traduire le message
    translated_message = message
    if language == 'fr' and message in messages['fr']:
            translated_message = messages['fr'][message]
    
    # Envoyer le message au frontend
    data = {
        "type": "progress",
        "message": translated_message,
        "language": language
    }
    
    if percentage is not None:
        data["progress"] = percentage
        
    print(json.dumps(data), flush=True)
    sys.stdout.flush()
    time.sleep(0.5)

def log_debug(message):
    """Log pour le débogage"""
    print(f"DEBUG: {message}", file=sys.stderr)
    sys.stderr.flush()

def run_command(command, use_sudo=False, exit_on_error=True):
    try:
        if use_sudo:
            command = f"echo '{sudo_password}' | sudo -S {command}"
        log_debug(f"Exécution de la commande: {command}")
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        log_debug(f"Sortie: {result.stdout}")
        log_debug(f"Erreur: {result.stderr}")
        if result.returncode != 0:
            if exit_on_error:
                raise Exception(f"Erreur: {result.stderr}")
            else:
                return None, result.stderr
        return result.stdout.strip(), None
    except Exception as e:
        if exit_on_error:
            raise Exception(f"Erreur: {str(e)}")
        return None, str(e)

def run_container_command(command, exit_on_error=True):
    current_dir = os.getcwd()
    host_config = os.path.expanduser("~/.config/solana")
    log_debug(f"Chemin de configuration Solana: {host_config}")
    docker_command = (
        f"sudo docker run --rm "
        f"-v {current_dir}:/app "
        f"-v {host_config}:/root/.config/solana "
        f"heysolana {command}"
    )
    log_debug(f"Exécution de la commande Docker: {docker_command}")
    return run_command(docker_command, use_sudo=True, exit_on_error=exit_on_error)

def validate_custom_prefix(prefix):
    """Valide et corrige le préfixe d'adresse personnalisée"""
    # Solana n'accepte que les lettres minuscules (a-z) comme préfixe
    valid_chars = 'abcdefghijklmnopqrstuvwxyz'
    
    # Filtrer les caractères invalides
    valid_prefix = ''.join(c for c in prefix.lower() if c in valid_chars)
    
    if valid_prefix != prefix:
        log_debug(f"Préfixe corrigé: '{prefix}' -> '{valid_prefix}'")
    
    # Si le préfixe est vide après filtrage, utiliser un préfixe par défaut
    if not valid_prefix:
        valid_prefix = 'lzcn'
        log_debug(f"Préfixe invalide, utilisation du préfixe par défaut: '{valid_prefix}'")
    
    return valid_prefix

def extract_address_from_output(output):
    """Extrait l'adresse du résultat de solana-keygen grind"""
    # Rechercher la ligne avec "Wrote keypair to"
    address = None
    lines = output.strip().split('\n')
    
    for line in lines:
        if "Wrote keypair to" in line:
            # Format: "Wrote keypair to dcatxy2L7crSuQtiDDCXFxo93bWbVVGa4nXMXtThPSR.json"
            log_debug(f"Ligne contenant l'adresse: {line}")
            parts = line.split("Wrote keypair to ")
            if len(parts) > 1:
                # Extraction de l'adresse en retirant l'extension .json
                file_name = parts[1].strip()
                if file_name.endswith(".json"):
                    address = file_name[:-5]  # Retire ".json"
                else:
                    address = file_name
    
    return address

def find_custom_address(prefix, result_queue, max_attempts=100, address_type='starts-with'):
    """Recherche une adresse personnalisée avec le préfixe spécifié"""
    log_debug(f"Démarrage de la recherche d'adresse avec préfixe validé: {prefix}")
    
    # Valider le préfixe: lettres et chiffres seulement
    if not re.match(r'^[a-zA-Z0-9]+$', prefix):
        result_queue.put(("error", "Préfixe invalide: utilisez uniquement des lettres et des chiffres"))
        return
    
    # Construire la commande en fonction du type d'adresse
    if address_type == 'ends-with':
        grind_param = f"--ends-with {prefix}:1"
    else:  # Par défaut: starts-with
        grind_param = f"--starts-with {prefix}:1"
    
    # Exécuter la commande pour trouver une adresse personnalisée
    solana_cmd = f"solana-keygen grind {grind_param}"
    docker_cmd = f"sudo docker run --rm -v {os.getcwd()}:/app -v {os.path.expanduser('~/.config/solana')}:/root/.config/solana -w /app/keypairs heysolana {solana_cmd}"
    
    log_debug(f"Exécution de la commande Docker: {docker_cmd}")
    
    process = None  # Initialiser process à None
    
    try:
        # Utiliser Docker pour exécuter solana-keygen
        current_dir = os.getcwd()
        host_config = os.path.expanduser("~/.config/solana")
        
        # Créer un répertoire temporaire pour stocker les keypairs
        keypair_dir = os.path.join(current_dir, "keypairs")
        if not os.path.exists(keypair_dir):
            os.makedirs(keypair_dir)
        
        # Utiliser le répertoire keypairs comme destination pour le fichier généré
        cmd = docker_cmd
        log_debug(f"Exécution de la commande Docker: {cmd}")
        
        # Initialiser le compteur de tentatives ici
        attempt_count = 0
        
        try:
            process = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            
            # Ajouter un timer pour les logs uniquement
            start_time = time.time()
            
            # Définir le nombre maximum de tentatives si non spécifié
            if max_attempts is None:
                max_attempts = 100
            
            log_debug(f"Recherche avec max_attempts={max_attempts}")
            
            while True:
                attempt_count += 1
                    
                # Vérifier uniquement le nombre de tentatives
                if attempt_count >= max_attempts:
                    elapsed_time = time.time() - start_time
                    log_debug(f"Nombre maximum de tentatives atteint: {max_attempts} après {elapsed_time:.1f} secondes")
                    
                    # S'assurer que le processus est bien terminé
                    if process and process.poll() is None:
                        try:
                            process.terminate()
                            process.wait(timeout=2)  # Attendre la fin du processus avec un timeout
                        except:
                            try:
                                process.kill()  # Forcer la terminaison si nécessaire
                            except:
                                pass
                    
                    # Envoyer un message de timeout explicite
                    log_debug("Envoi du message de timeout au frontend")
                    result_queue.put(("timeout", f"Maximum attempts ({max_attempts}) reached"))
                    return
                    
                # Vérifier si le processus a terminé
                if process.poll() is not None:
                    output = process.stdout.read().decode()
                    log_debug(f"Sortie brute: {output}")
                    
                    try:
                        # Extraire l'adresse du résultat
                        address = extract_address_from_output(output)
                        
                        if address:
                            log_debug(f"Adresse trouvée: {address}")
                            
                            # S'assurer que le processus est bien terminé
                            if process and process.poll() is None:
                                try:
                                    process.terminate()
                                    process.wait(timeout=2)
                                except:
                                    pass
                            
                            # Envoyer l'adresse trouvée
                            result_queue.put(("success", address))
                            return
                        else:
                            log_debug(f"Impossible d'extraire l'adresse. Sortie complète: {output}")
                            # Relancer le processus
                            process = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    except Exception as e:
                        log_debug(f"Erreur lors de l'extraction de l'adresse: {str(e)}")
                        # Relancer le processus en cas d'erreur
                        process = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                
                # Envoyer un message de progression périodique
                if attempt_count % 10 == 0:
                    elapsed_time = time.time() - start_time
                    log_debug(f"Recherche en cours... Tentative {attempt_count}, temps écoulé: {elapsed_time:.1f}s")
            
                time.sleep(0.5)  # Petite pause pour ne pas surcharger le CPU
        except Exception as e:
            log_debug(f"Erreur lors de la recherche d'adresse: {str(e)}")
            result_queue.put(("error", str(e)))
            return
            
    finally:
        # S'assurer que le processus est bien terminé, même en cas d'exception
        if process and process.poll() is None:
            try:
                process.terminate()
                process.wait(timeout=2)
            except:
                try:
                    process.kill()
                except:
                    pass

def create_token(args):
    try:
        # Initialisation des variables
        mint_address = None
        keypair_path = None
        
        # Vérifier si on utilise une adresse personnalisée
        if args.custom_address_prefix:
            # L'adresse personnalisée a déjà été trouvée dans la fonction main
            # Récupérer le chemin du fichier keypair
            keypair_dir = os.path.join(os.getcwd(), "keypairs")
            keypair_files = [f for f in os.listdir(keypair_dir) if f.endswith('.json')]
            
            if keypair_files:
                # Trier par date de modification (le plus récent en premier)
                keypair_files.sort(key=lambda x: os.path.getmtime(os.path.join(keypair_dir, x)), reverse=True)
                keypair_path = os.path.join(keypair_dir, keypair_files[0])
                mint_address = keypair_files[0].replace('.json', '')
                log_debug(f"Utilisation du keypair trouvé: {keypair_path}")
                
                # Vérifier si le fichier existe réellement
                if not os.path.exists(keypair_path):
                    log_debug(f"⚠️ Le fichier keypair n'existe pas: {keypair_path}")
                    mint_address = None
                    keypair_path = None
            else:
                # Si aucun fichier keypair n'est trouvé, créer un nouveau token sans adresse personnalisée
                log_debug("Aucun fichier keypair trouvé, création d'un token avec une adresse aléatoire")
                mint_address = None
                keypair_path = None
        
        # Configuration initiale de Solana - ne pas afficher de message de démarrage redondant
        log_progress("⚙️ Configuring Solana environment...", 75, args.language)
        
        # Configurer l'URL du réseau (devnet)
        run_container_command("solana config set --url https://api.devnet.solana.com")
        
        # Vérifier le solde et demander un airdrop si nécessaire
        log_progress("💰 Checking wallet balance...", 77, args.language)
        balance_output, _ = run_container_command("solana balance", exit_on_error=False)
        
        if balance_output:
            try:
                # Extraire le solde (format: "5 SOL")
                balance_parts = balance_output.split()
                balance = float(balance_parts[0])
                log_debug(f"Solde actuel: {balance} SOL")
                
                # Si le solde est insuffisant, demander un airdrop
                if balance < 0.5:
                    log_debug("Solde insuffisant, demande d'airdrop...")
                    log_progress("🚰 Requesting SOL airdrop...", 78, args.language)
                    run_container_command("solana airdrop 1")
                    # Attendre que l'airdrop soit confirmé
                    time.sleep(2)
            except Exception as e:
                log_debug(f"Erreur lors de la vérification du solde: {str(e)}")
        
        # Étape 2: Création du token
        log_progress("🔨 Creating token on blockchain...", 80, args.language)
        
        # Définir les IDs des programmes
        # Utiliser le même programme pour la création du token et les métadonnées
        token_program_id = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        
        if mint_address and keypair_path and os.path.exists(keypair_path):
            # Si on a déjà une adresse personnalisée, utiliser le keypair existant
            log_debug(f"Utilisation de l'adresse personnalisée: {mint_address}")
            
            try:
                # Créer le token avec l'adresse personnalisée
                # Utiliser directement le fichier keypair dans le conteneur Docker
                token_output, _ = run_container_command(f"spl-token create-token --program-id {token_program_id} --enable-metadata --decimals 9 /app/keypairs/{mint_address}.json")
                log_debug(f"Résultat de la création du token: {token_output}")
                
                # Extraire l'adresse du token à partir de la sortie
                # Format: "Creating token [ADDRESS] under program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
                for line in token_output.split('\n'):
                    if "Creating token" in line:
                        # Extraire le deuxième mot après "Creating token"
                        parts = line.split()
                        if len(parts) >= 3:
                            mint_address = parts[2]  # Prendre le 3ème élément (index 2)
                            log_debug(f"Adresse extraite: {mint_address}")
                        break
            except Exception as e:
                log_debug(f"Erreur lors de l'utilisation du keypair personnalisé: {str(e)}")
                # En cas d'erreur, créer un token avec une adresse aléatoire
                mint_address = None
                keypair_path = None
        
        # Si on n'a pas pu utiliser l'adresse personnalisée, créer un token avec une adresse aléatoire
        if not mint_address:
            # Créer un nouveau token avec une adresse aléatoire
            log_debug("Création d'un token avec une adresse aléatoire")
            token_output, _ = run_container_command(f"spl-token create-token --program-id {token_program_id} --enable-metadata --decimals 9")
            log_debug(f"Résultat de la création du token: {token_output}")
            
            # Extraire l'adresse du token
            mint_address = None  # Réinitialiser pour être sûr
            
            # Format: "Creating token [ADDRESS] under program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
            for line in token_output.split('\n'):
                if "Creating token" in line:
                    # Extraire le deuxième mot après "Creating token"
                    parts = line.split()
                    if len(parts) >= 3:
                        mint_address = parts[2]  # Prendre le 3ème élément (index 2)
                        log_debug(f"Adresse extraite: {mint_address}")
                    break
            
            if not mint_address:
                # Essayer une autre méthode d'extraction
                for line in token_output.split('\n'):
                    if "Address:" in line:
                        parts = line.split()
                        if len(parts) > 1:
                            mint_address = parts[-1]
                            log_debug(f"Adresse extraite de la ligne 'Address:': {mint_address}")
                            break
        
        if not mint_address:
            raise Exception("Impossible de récupérer l'adresse du token")
        
        log_debug(f"Adresse du token à utiliser pour la suite: {mint_address}")
        log_progress("🔑 Token address generated", 85, args.language)
        
        # Sauvegarder le fichier keypair du token pour le téléchargement
        keypair_dir = os.path.join(os.getcwd(), "keypairs")
        if not os.path.exists(keypair_dir):
            # Créer le répertoire avec les bonnes permissions
            os.makedirs(keypair_dir, exist_ok=True)
            # S'assurer que le répertoire a les bonnes permissions
            chmod_cmd = f"sudo chmod -R 777 {keypair_dir}"
            run_command(chmod_cmd, use_sudo=True, exit_on_error=False)
        
        # Créer directement un fichier keypair factice pour permettre le téléchargement
        keypair_file = os.path.join(keypair_dir, f"{mint_address}.json")
        try:
            # Créer un fichier JSON minimal avec l'adresse du token
            with open(keypair_file, 'w') as f:
                json.dump({"address": mint_address, "mint": True}, f)
            log_debug(f"Fichier keypair factice créé: {keypair_file}")
            
            # S'assurer que le fichier a les bonnes permissions
            chmod_cmd = f"sudo chmod 666 {keypair_file}"
            run_command(chmod_cmd, use_sudo=True, exit_on_error=False)
        except Exception as e:
            log_debug(f"⚠️ Erreur lors de la création du fichier keypair factice: {str(e)}")
            # Essayer une autre approche avec sudo
            try:
                temp_file = f"/tmp/{mint_address}.json"
                with open(temp_file, 'w') as f:
                    json.dump({"address": mint_address, "mint": True}, f)
                
                # Copier le fichier avec sudo
                copy_cmd = f"sudo cp {temp_file} {keypair_file}"
                run_command(copy_cmd, use_sudo=True, exit_on_error=False)
                
                # Changer les permissions
                chmod_cmd = f"sudo chmod 666 {keypair_file}"
                run_command(chmod_cmd, use_sudo=True, exit_on_error=False)
                
                log_debug(f"Fichier keypair factice créé avec sudo: {keypair_file}")
            except Exception as e2:
                log_debug(f"⚠️ Erreur lors de la création du fichier keypair factice avec sudo: {str(e2)}")
        
        # Création du compte - utiliser le programme ATA
        log_progress("💼 Creating token account...", 87, args.language)
        
        # Utiliser spl-token create-account sans spécifier de programme
        # La commande spl-token déterminera automatiquement le bon programme à utiliser
        account_output, _ = run_container_command(f"spl-token create-account {mint_address}")
        log_debug(f"Résultat de la création du compte: {account_output}")
        
        # Mint des tokens
        log_progress("💎 Minting tokens...", 90, args.language)
        mint_output, _ = run_container_command(f"spl-token mint {mint_address} 1000000000")
        log_debug(f"Résultat du mint: {mint_output}")
        
        # Configuration des métadonnées
        log_progress("📋 Configuring metadata...", 93, args.language)
        
        # Utiliser le programme TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb pour les métadonnées
        # Format: spl-token initialize-metadata <TOKEN_MINT_ADDRESS> <TOKEN_NAME> <TOKEN_SYMBOL> <TOKEN_URI>
        metadata_cmd = (
            f"spl-token initialize-metadata {mint_address} "
            f"\"{args.token_name}\" \"{args.token_symbol}\" \"{args.metadata_url}\""
        )
        metadata_output, _ = run_container_command(metadata_cmd)
        log_debug(f"Résultat de l'initialisation des métadonnées: {metadata_output}")
        
        # Désactiver le mint si demandé
        log_debug(f"Valeur de disable_mint: {args.disable_mint}")
        if hasattr(args, 'disable_mint') and args.disable_mint:
            log_progress("🔒 Disabling mint...", 95, args.language)
            try:
                disable_output, _ = run_container_command(f"spl-token authorize {mint_address} mint --disable")
                log_debug(f"Résultat de la désactivation du mint: {disable_output}")
                log_debug("Mint désactivé avec succès")
            except Exception as e:
                log_debug(f"Erreur lors de la désactivation du mint: {str(e)}")
        
        # Finalisation
        log_progress("✨ Finalizing token creation...", 98, args.language)
        time.sleep(1)
        
        # Récupérer les métadonnées du token
        token_info = {
            "address": mint_address,
            "name": args.token_name,
            "symbol": args.token_symbol,
            "description": args.description,
            "image": args.image_url,
            "metadata_url": args.metadata_url,
            "website": args.website,
            "twitter": args.twitter,
            "telegram": args.telegram,
            "discord": args.discord if hasattr(args, 'discord') else "",
            "github": args.github if hasattr(args, 'github') else "",
            "medium": args.medium if hasattr(args, 'medium') else "",
            "reddit": args.reddit if hasattr(args, 'reddit') else "",
            "explorer_url": f"https://explorer.solana.com/address/{mint_address}?cluster=devnet"
        }
        
        # Envoyer le résultat final
        log_progress("✅ Token successfully created!", 100, args.language)
        print(json.dumps({"type": "result", "metadata": token_info}), flush=True)
        
        return 0
        
    except Exception as e:
        log_debug(f"Erreur dans create_token: {str(e)}")
        print(json.dumps({"type": "error", "error": str(e)}), flush=True)
        return 1

def fetch_token_metadata_from_firecrawl(token_address, api_key):
    """Cette fonction est remplacée par l'implémentation qui fonctionne"""
    return scrape_token_metadata(token_address, api_key, "en")

def scrape_token_metadata(token_address, firecrawl_api_key, language):
    try:
        log_debug("====== DÉBUT SCRAPING ======")
        
        if not firecrawl_api_key:
            raise Exception("Clé API Firecrawl manquante")
            
        # URL de l'explorateur Solana pour les métadonnées
        explorer_url = f"https://explorer.solana.com/address/{token_address}/metadata"
        log_debug(f"URL Explorer: {explorer_url}")
        
        # Configuration de la requête Firecrawl
        import requests
        import json
        
        request_body = {
            "url": explorer_url,
            "formats": ["markdown"],
            "actions": [
                {"type": "wait", "milliseconds": 4000},
                {"type": "scrape", "selector": ".card-metaplex-metadata"}
            ]
        }
        
        headers = {
            "Authorization": f"Bearer {firecrawl_api_key}",
            "Content-Type": "application/json"
        }
        
        log_debug("Envoi de la requête Firecrawl...")
        response = requests.post(
            "https://api.firecrawl.dev/v1/scrape",
            headers=headers,
            json=request_body
        )
        
        if response.status_code != 200:
            log_debug(f"Erreur Firecrawl: {response.status_code}, {response.text}")
            raise Exception(f"Erreur Firecrawl: {response.status_code}")
            
        response_data = response.json()
        log_debug(f"Réponse brute: {response_data}")
        
        # Extraire l'URL IPFS avec plusieurs méthodes
        markdown = response_data.get('data', {}).get('markdown', '')
        import re
        
        # Méthode 1: recherche standard
        ipfs_match = re.search(r'string"(https:\/\/[^\"]+)"', markdown)
        
        # Méthode 2: recherche "uri"
        if not ipfs_match:
            ipfs_match = re.search(r'"uri":\s*\n*\s*\n*string"([^"]+)"', markdown)
        
        # Méthode 3: recherche générique d'URL IPFS
        if not ipfs_match:
            ipfs_match = re.search(r'(https:\/\/ipfs\.io\/[^\s\"\'\)]+)', markdown)
            
        # Méthode 4: recherche d'URL gateway.irys
        if not ipfs_match:
            ipfs_match = re.search(r'(https:\/\/gateway\.irys\.xyz\/[^\s\"\'\)]+)', markdown)
        
        if not ipfs_match:
            log_debug("URL IPFS non trouvée dans la réponse")
            # Au lieu de lever une exception, utiliser des métadonnées par défaut
            raise Exception("URL IPFS non trouvée dans la réponse Firecrawl")
        
        # Traiter l'URL trouvée
        ipfs_url = ipfs_match.group(1)
        
        # Amélioration du nettoyage d'URL - supprimer les caractères d'échappement et les artefacts de markdown
        ipfs_url = ipfs_url.replace('\\_', '_').replace('\\/', '/')
        
        # Nettoyer les artefacts de markdown comme "](" souvent présents dans le texte scrapé
        if "](" in ipfs_url:
            ipfs_url = ipfs_url.split("](")[0]  # Prendre seulement la partie avant "]("
        
        log_debug(f"URL IPFS trouvée et nettoyée: {ipfs_url}")
        
        # Extraction plus fiable de l'ID IPFS ou Irys
        ipfs_id = None

        # Si c'est une URL Irys
        if "gateway.irys.xyz" in ipfs_url:
            # Essayer d'extraire l'ID
            parts = ipfs_url.split("/")
            if len(parts) > 3:
                ipfs_id = parts[-1]  # Prendre le dernier segment
                log_debug(f"ID Irys extrait: {ipfs_id}")
                
                # Créer des URLs alternatives
                fallback_urls = [
                    f"https://gateway.irys.xyz/{ipfs_id}",
                    f"https://ipfs.io/ipfs/{ipfs_id}"
                ]
        # Si c'est une URL IPFS
        elif "ipfs.io/ipfs" in ipfs_url:
            parts = ipfs_url.split("/ipfs/")
            if len(parts) > 1:
                ipfs_id = parts[-1]  # Prendre le dernier segment
                log_debug(f"ID IPFS extrait: {ipfs_id}")
                
                # Créer des URLs alternatives
                fallback_urls = [
                    f"https://ipfs.io/ipfs/{ipfs_id}",
                    f"https://gateway.irys.xyz/{ipfs_id}"
                ]
        else:
            # URL inconnue, essayer d'extraire l'ID comme dernier segment
            parts = ipfs_url.split("/")
            if len(parts) > 1:
                ipfs_id = parts[-1]
                fallback_urls = [
                    f"https://ipfs.io/ipfs/{ipfs_id}",
                    f"https://gateway.irys.xyz/{ipfs_id}"
                ]
            else:
                fallback_urls = []

        log_debug(f"URLs de secours préparées: {fallback_urls}")
        
        # Récupérer les métadonnées en essayant l'URL principale et les URL de secours
        metadata = None
        errors = []
        
        urls_to_try = [ipfs_url]
        if "fallback_urls" in locals():
            urls_to_try.extend(fallback_urls)
        
        for url in urls_to_try:
            try:
                log_debug(f"Tentative de récupération des métadonnées depuis: {url}")
                metadata_response = requests.get(url, headers={
                    "Accept": "application/json",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                }, timeout=10)
                
                if metadata_response.status_code == 200:
                    metadata = metadata_response.json()
                    log_debug(f"Métadonnées récupérées avec succès depuis: {url}")
                    break
                else:
                    error = f"Erreur {metadata_response.status_code} pour {url}"
                    log_debug(error)
                    errors.append(error)
            except Exception as e:
                error = f"Exception pour {url}: {str(e)}"
                log_debug(error)
                errors.append(error)
        
        if metadata is None:
            log_debug(f"Toutes les tentatives ont échoué: {', '.join(errors)}")
            # Créer des métadonnées par défaut
            token_short = token_address[:5].lower()
            return {
                'name': f"Token {token_short}",
                'symbol': token_short.upper(),
                'description': f"Token créé à partir de l'adresse {token_address}",
                'image': "https://ipfs.io/ipfs/QmcUuY1Hwr5z73eGYDkA6VNVdzRg6J51rTC29qL7DMjwoC",
                'metadata_url': ipfs_url,  # Garder l'URL d'origine même si elle ne fonctionne pas
                'website': '',
                'twitter': '',
                'telegram': ''
            }
        
        log_debug(f"Métadonnées brutes récupérées: {metadata}")
        
        # Normaliser l'URL de l'image
        image_url = metadata.get('image', '')
        if image_url:
            if image_url.startswith('ipfs://'):
                image_url = f"https://ipfs.io/ipfs/{image_url.replace('ipfs://', '')}"
            elif not image_url.startswith('http'):
                image_url = f"https://ipfs.io/ipfs/{image_url}"
        
        result = {
            "name": metadata.get('name', ''),
            "symbol": metadata.get('symbol', ''),
            "description": metadata.get('description', ''),
            "image": image_url,  # Utiliser l'URL normalisée
            "metadata_url": ipfs_url,
            "website": metadata.get('website', ''),
            "twitter": metadata.get('twitter', ''),
            "telegram": metadata.get('telegram', ''),
            "discord": metadata.get('discord', ''),
            "github": metadata.get('github', ''),
            "medium": metadata.get('medium', ''),
            "reddit": metadata.get('reddit', '')
        }
        
        log_debug(f"Métadonnées formatées: {result}")
        return result
        
    except Exception as e:
        log_debug(f"ERREUR DÉTAILLÉE: {str(e)}")
        log_debug("Utilisation de métadonnées par défaut suite à l'erreur")
        
        # Créer des métadonnées par défaut à partir de l'adresse du token
        token_short = token_address[:5].lower()
        return {
            'name': f"Token {token_short}",
            'symbol': token_short.upper(),
            'description': f"Token créé à partir de l'adresse {token_address}",
            'image': "https://ipfs.io/ipfs/QmcUuY1Hwr5z73eGYDkA6VNVdzRg6J51rTC29qL7DMjwoC",  # Image par défaut
            'metadata_url': "",
            'website': '',
            'twitter': '',
            'telegram': ''
        }

def copy_token(args):
    try:
        # IMPORTANT: Récupérer d'abord les métadonnées du token source
        log_progress("😈 Récupération des métadonnées du token source...", 50, args.language)
        
        if args.firecrawl_api_key:
            token_data = fetch_token_metadata_from_firecrawl(args.token_address, args.firecrawl_api_key)
            
            if token_data:
                # Mettre à jour les arguments avec les métadonnées récupérées
                args.token_name = token_data.get('name')
                args.token_symbol = token_data.get('symbol')
                args.description = token_data.get('description', '')
                args.image_url = token_data.get('image', '')
                args.metadata_url = token_data.get('uri', '')
                
                # Autres métadonnées
                args.website = token_data.get('website', '')
                args.twitter = token_data.get('twitter', '')
                args.telegram = token_data.get('telegram', '')
                args.discord = token_data.get('discord', '')
                
                log_debug(f"Métadonnées récupérées: name={args.token_name}, symbol={args.token_symbol}")
            else:
                log_debug("Impossible de récupérer les métadonnées du token source")
        
        # APRÈS avoir récupéré les métadonnées, continuer avec la création du token
        # Utiliser la fonction create_token existante avec les métadonnées récupérées
        return create_token(args)
        
    except Exception as e:
        log_debug(f"Erreur dans copy_token: {str(e)}")
        print(json.dumps({"type": "error", "error": str(e)}), flush=True)
        return 1

def initialize_metadata(token_address, args):
    # Utiliser les valeurs récupérées ou des valeurs par défaut
    token_name = args.token_name if args.token_name and args.token_name != "None" else ""
    token_symbol = args.token_symbol if args.token_symbol and args.token_symbol != "None" else ""
    token_uri = args.metadata_url if args.metadata_url else ""
    
    log_debug(f"Initialisation des métadonnées: name={token_name}, symbol={token_symbol}, uri={token_uri}")
    
    # Exécuter la commande avec les bonnes valeurs
    # ... reste du code existant pour l'exécution de la commande ...

def main():
    parser = argparse.ArgumentParser(description='Créer un token sur Solana')
    parser.add_argument('--mode', choices=['create', 'copy'], default='create')
    parser.add_argument('--language', default='en')
    parser.add_argument('--token-name', required=False)
    parser.add_argument('--token-symbol', required=False)
    parser.add_argument('--description', default="")
    parser.add_argument('--image-url', default="")
    parser.add_argument('--metadata-url', default="")
    parser.add_argument('--token-address', default="")
    parser.add_argument('--firecrawl-api-key', required=False)
    parser.add_argument('--pinata-api-key', required=False)
    parser.add_argument('--pinata-secret-key', required=False)
    
    # Arguments optionnels
    parser.add_argument('--website', nargs='?', const='', default="")
    parser.add_argument('--twitter', nargs='?', const='', default="")
    parser.add_argument('--telegram', nargs='?', const='', default="")
    parser.add_argument('--discord', nargs='?', const='', default="")
    parser.add_argument('--github', nargs='?', const='', default="")
    parser.add_argument('--medium', nargs='?', const='', default="")
    parser.add_argument('--reddit', nargs='?', const='', default="")
    parser.add_argument('--disable-mint', action='store_true', help='Disable mint authority')
    parser.add_argument('--custom-address-prefix', required=False, help='Custom address prefix')
    parser.add_argument('--custom-address-type', choices=['starts-with', 'ends-with'], default='starts-with', 
                        help='Type of custom address: starts with or ends with the prefix')
    parser.add_argument('--retry', action='store_true', help='Indicates this is a retry attempt')
    
    # Nouveaux arguments explicites pour le timeout et le nombre max de tentatives
    parser.add_argument('--timeout-seconds', type=int, default=30, help='Timeout in seconds for address search')
    parser.add_argument('--max-attempts', type=int, default=100, help='Maximum number of attempts for address search')
    
    args = parser.parse_args()
    
    # Logguer tous les arguments pour le débogage
    log_debug(f"Arguments reçus: {sys.argv}")
    log_debug(f"Arguments parsés: {args}")
    
    try:
        # IMPORTANT: En mode 'copy', récupérer d'abord les métadonnées
        if args.mode == 'copy':
            if not args.token_address:
                raise Exception("Token address is required for copy mode")
            
            # Récupérer les métadonnées en premier
            log_progress("😈 Récupération des métadonnées du token source...", 50, args.language)
            
            if args.firecrawl_api_key:
                token_data = fetch_token_metadata_from_firecrawl(args.token_address, args.firecrawl_api_key)
                
                if token_data:
                    # Mettre à jour les arguments avec les métadonnées récupérées
                    args.token_name = token_data.get('name')
                    args.token_symbol = token_data.get('symbol')
                    args.description = token_data.get('description', '')
                    args.image_url = token_data.get('image', '')
                    args.metadata_url = token_data.get('uri', '')
                    
                    # Autres métadonnées
                    args.website = token_data.get('website', '')
                    args.twitter = token_data.get('twitter', '')
                    args.telegram = token_data.get('telegram', '')
                    args.discord = token_data.get('discord', '')
                    
                    log_debug(f"Métadonnées récupérées: name={args.token_name}, symbol={args.token_symbol}")
                else:
                    log_debug("Impossible de récupérer les métadonnées du token source")
        
        # APRÈS avoir récupéré les métadonnées si nécessaire, traiter l'adresse personnalisée
        
        # Vérifier si c'est une reprise de recherche
        is_retry = args.retry
        log_debug(f"Détection directe de --retry: {is_retry}")
        
        # Vérifier si le préfixe d'adresse personnalisée est spécifié
        if args.custom_address_prefix:
            # Définir le nombre maximum de tentatives
            max_attempts = 100
            if args.max_attempts:
                try:
                    # Limiter à 100 même si une valeur plus grande est fournie
                    max_attempts = min(int(args.max_attempts), 100)
                    log_debug(f"Utilisation de max_attempts={max_attempts}")
                except ValueError:
                    log_debug(f"Valeur invalide pour max_attempts: {args.max_attempts}, utilisation de la valeur par défaut: 100")
            
            # Message approprié selon l'état
            if is_retry:
                # Utiliser la dernière progression connue, stockée côté serveur
                log_progress("🔍 Continuing custom address search...", 60, args.language)
                log_debug(f">> REPRISE DE LA RECHERCHE avec préfixe: '{args.custom_address_prefix}' et max_attempts={max_attempts}")
            else:
                log_progress("🔍 Searching for custom address...", 60, args.language)  # Utiliser 15% au lieu de 60%
                log_debug(f">> PREMIÈRE RECHERCHE avec préfixe: '{args.custom_address_prefix}' et max_attempts={max_attempts}")
            
            result_queue = queue.Queue()
            
            # Ajuster les paramètres pour la reprise
            if is_retry:
                args.timeout_seconds = 180
            
            log_debug(f"⚠️ PARAMÈTRES FINAUX: retry={is_retry}, timeout={args.timeout_seconds}s")
            
            search_thread = threading.Thread(
                target=find_custom_address,
                args=(args.custom_address_prefix, result_queue, max_attempts, args.custom_address_type)
            )
            search_thread.daemon = True
            search_thread.start()
            
            # Attendre le résultat sans timeout
            result_type, result_value = result_queue.get()
            
            if result_type == "timeout":
                # Le nombre maximum de tentatives a été atteint
                log_debug(f"Nombre maximum de tentatives atteint: {result_value}")
                print(json.dumps({
                    "type": "timeout",
                    "message": "Maximum attempts reached" if args.language == "en" else "Nombre maximum de tentatives atteint",
                    "language": args.language
                }), flush=True)
                sys.stdout.flush()
                return
            elif result_type == "error":
                raise Exception(f"Error finding custom address: {result_value}")
            elif result_type == "success":    
                # Utiliser l'adresse trouvée pour la suite
                mint_address = result_value.strip()
                log_debug(f"Adresse personnalisée trouvée: {mint_address}")
                
                # S'assurer que le fichier keypair est correctement copié dans le répertoire keypairs
                keypair_dir = os.path.join(os.getcwd(), "keypairs")
                if not os.path.exists(keypair_dir):
                    os.makedirs(keypair_dir)
                
                # Vérifier si le fichier keypair existe déjà dans le répertoire keypairs
                keypair_file = os.path.join(keypair_dir, f"{mint_address}.json")
                if not os.path.exists(keypair_file):
                    log_debug(f"Fichier keypair non trouvé dans {keypair_file}, tentative de copie depuis le conteneur Docker")
                    
                    # Copier le fichier keypair depuis le conteneur Docker
                    copy_cmd = f"sudo docker run --rm -v {os.getcwd()}:/app -v {os.path.expanduser('~/.config/solana')}:/root/.config/solana -w /app/keypairs heysolana cp /app/keypairs/{mint_address}.json /app/keypairs/{mint_address}.json"
                    try:
                        subprocess.run(copy_cmd, shell=True, check=True)
                        log_debug(f"Fichier keypair copié avec succès")
                    except Exception as e:
                        log_debug(f"Erreur lors de la copie du fichier keypair: {str(e)}")
                
                # Continuer avec la création du token - un seul message clair
                log_progress("🚀 Creating token with custom address...", 70, args.language)
            else:
                raise Exception(f"Unknown status from address search: {result_type}")
        else:
            # Initialisation sans adresse personnalisée
            mint_address = None
        
        # Maintenant exécuter la fonction appropriée avec les métadonnées et l'adresse
        if args.mode == 'create':
            if not args.token_name or not args.token_symbol or not args.metadata_url:
                raise Exception("Token name, symbol and metadata URL are required")
            return create_token(args)
            
        elif args.mode == 'copy':
            # Ne pas appeler la fonction copy_token car nous avons déjà récupéré les métadonnées
            return create_token(args)
            
    except Exception as e:
        print(json.dumps({"type": "error", "error": str(e)}), flush=True)
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
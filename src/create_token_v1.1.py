import os
import subprocess
import time
import getpass
import requests
import json
import base64
import threading
import customtkinter as ctk

# Couleurs ANSI pour l'affichage
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
RESET = "\033[0m"

sudo_password = None  # Stocke le mot de passe sudo

# Vos identifiants Pinata
PINATA_API_KEY = os.environ.get("PINATA_API_KEY", "")
PINATA_API_SECRET = os.environ.get("PINATA_SECRET_KEY", "")

def run_command(command, use_sudo=False, exit_on_error=True):
    global sudo_password
    if use_sudo:
        if sudo_password is None:
            sudo_password = getpass.getpass(f"{YELLOW}Entrez votre mot de passe sudo: {RESET}")
        command = f"echo '{sudo_password}' | sudo -S {command}"
    result = subprocess.run(command, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        if exit_on_error:
            print(f"{RED}❌ Erreur lors de l'exécution de la commande:{RESET}")
            print(f"{CYAN}Commande:{RESET} {command}")
            print(f"{CYAN}stdout:{RESET} {result.stdout.strip()}")
            print(f"{CYAN}stderr:{RESET} {result.stderr.strip()}")
            exit(1)
        else:
            return result.stdout.strip(), result.stderr.strip()
    return result.stdout.strip()

def run_container_command(command, exit_on_error=True):
    current_dir = os.getcwd().replace("'", "'\\''")  # Échapper les apostrophes
    host_solana_config = os.path.expanduser("~/.config/solana").replace("'", "'\\''")
    full_command = (
        f"sudo docker run --rm -v '{current_dir}:/solana-token' "  # Ajout des guillemets simples
        f"-v '{host_solana_config}:/root/.config/solana' "  # Ajout des guillemets simples
        f"-v '{current_dir}/solana-data:/solana-token/solana-data' "  # Ajout des guillemets simples
        f"heysolana {command}"
    )
    return run_command(full_command, use_sudo=True, exit_on_error=exit_on_error)

def check_balance(keypair="id.json"):
    # D'abord initialiser le default signer
    run_container_command("solana config set --keypair /root/.config/solana/id.json")
    
    # Ensuite vérifier le solde
    output = run_container_command(f"solana balance --keypair /root/.config/solana/{keypair}")
    try:
        balance = float(output.split(" ")[0])
    except Exception:
        balance = 0.0
    return balance

def wait_for_account_balance(keypair_path, expected_balance, timeout=30, interval=3):
    base = os.path.basename(keypair_path)
    print(f"{YELLOW}⏳ Vérification du solde pour {base}...{RESET}")
    start = time.time()
    while time.time() - start < timeout:
        output = run_command(
            f"sudo docker run --rm -v {os.getcwd()}:/solana-token -v {os.path.expanduser('~/.config/solana')}:/root/.config/solana -v {os.getcwd()}/solana-data:/solana-token/solana-data heysolana solana balance --keypair {keypair_path}",
            use_sudo=True, exit_on_error=False
        )
        try:
            balance = float(output.split(" ")[0])
        except Exception:
            balance = 0.0
        if balance >= expected_balance:
            print(f"{GREEN}✅ Solde atteint: {balance} SOL{RESET}")
            return True
        time.sleep(interval)
    print(f"{RED}❌ Le solde pour {base} n'a pas atteint {expected_balance} SOL dans le délai imparti.{RESET}")
    return False

def transfer_sol(from_keypair, to_keypair, amount):
    print(f"\n{YELLOW}🔄 Transfert de {amount} SOL depuis le wallet principal...{RESET}")
    recipient = run_container_command(f"solana-keygen pubkey /solana-token/solana-data/{to_keypair}")
    run_container_command(
        f"solana transfer --from /root/.config/solana/{from_keypair} "
        f"{recipient} {amount} --allow-unfunded-recipient --fee-payer /root/.config/solana/id.json"
    )
    wait_for_account_balance("/solana-token/solana-data/mint.json", amount, timeout=30, interval=3)
    print(f"{GREEN}✅ Transfert terminé!{RESET}")

def transfer_sol_with_retry(from_keypair, to_keypair, amount, max_attempts=3):
    attempt = 0
    while attempt < max_attempts:
        print(f"\n{YELLOW}🔄 Transfert de {amount} SOL depuis le wallet principal (tentative {attempt+1})...{RESET}")
        recipient = run_container_command(f"solana-keygen pubkey /solana-token/solana-data/{to_keypair}")
        run_container_command(
            f"solana transfer --from /root/.config/solana/{from_keypair} "
            f"{recipient} {amount} --allow-unfunded-recipient --fee-payer /root/.config/solana/id.json"
        )
        if wait_for_account_balance("/solana-token/solana-data/mint.json", amount, timeout=30, interval=3):
            print(f"{GREEN}✅ Transfert terminé!{RESET}")
            return True
        else:
            print(f"{YELLOW}⏳ Réessai du transfert...{RESET}")
        attempt += 1
    print(f"{RED}❌ Le transfert initial vers mint.json n'a pas abouti après {max_attempts} tentatives.{RESET}")
    return False

def spinner(stop_event):
    spinner_chars = ['|', '/', '-', '\\']
    idx = 0
    start_time = time.time()
    while not stop_event.is_set():
        elapsed = int(time.time() - start_time)
        print(f"\r🔍 Recherche en cours... {spinner_chars[idx % len(spinner_chars)]} ({elapsed}s écoulées)", end='', flush=True)
        time.sleep(0.1)
        idx += 1
    print("\r", end='', flush=True)

def grind_key(prefix, total_timeout, outfile):
    """
    Essaie de générer une clé dont la pubkey commence par le préfixe voulu.
    On boucle jusqu'à total_timeout secondes, avec une pause entre chaque tentative.
    """
    start_time = time.time()
    while time.time() - start_time < total_timeout:
        try:
            # On limite chaque tentative à 2 secondes
            result = subprocess.run(
                f"solana-keygen grind --starts-with {prefix}:1 --num-results 1 --outfile {outfile}",
                shell=True, capture_output=True, text=True, timeout=2
            )
            if result.returncode == 0:
                return True
        except subprocess.TimeoutExpired:
            pass
        time.sleep(0.5)
    return False

def create_dockerfile():
    dockerfile_content = """
FROM debian:bullseye-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \\
    curl build-essential libssl-dev pkg-config
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"
RUN curl -sSfL https://release.anza.xyz/stable/install | sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"
RUN solana config set --url https://api.devnet.solana.com
WORKDIR /solana-token
CMD ["/bin/bash"]
"""
    with open("Dockerfile", "w") as f:
        f.write(dockerfile_content)
    print(f"\n{GREEN}📄 Dockerfile généré!{RESET}")

def build_docker_image():
    run_command("sudo docker build -t heysolana .", use_sudo=True)
    print(f"{GREEN}🐳 Image Docker construite!{RESET}\n")

def upload_metadata_to_pinata(metadata):
    url = "https://api.pinata.cloud/pinning/pinJSONToIPFS"
    headers = {
        "pinata_api_key": PINATA_API_KEY,
        "pinata_secret_api_key": PINATA_API_SECRET,
        "Content-Type": "application/json"
    }
    payload = {"pinataContent": metadata}
    response = requests.post(url, json=payload, headers=headers)
    if response.status_code == 200:
        ipfs_hash = response.json()["IpfsHash"]
        return "https://gateway.pinata.cloud/ipfs/" + ipfs_hash
    else:
        print(f"{RED}❌ Erreur lors de l'upload des metadata:{RESET}", response.text)
        exit(1)

def get_metadata_from_solana(token_address):
    print(f"{YELLOW}⏳ Récupération des données...{RESET}")
    try:
        session = requests.Session()
        session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Authorization': f'Bearer {os.environ.get("FIRECRAWL_API_KEY", "")}',
            'Content-Type': 'application/json'
        })

        target_url = f'https://explorer.solana.com/address/{token_address}/metadata'
        firecrawl_url = "https://api.firecrawl.dev/v1/scrape"
        
        payload = {
            "url": target_url,
            "formats": ["markdown", "html"]
        }
        
        response = session.post(firecrawl_url, json=payload, timeout=60)
        
        if response.status_code != 200:
            print(f"{RED}❌ Erreur lors de la récupération{RESET}")
            return None
            
        data = response.json()
        content = data.get('data', {}).get('markdown', '')
        if not content:
            print(f"{RED}❌ Pas de contenu trouvé{RESET}")
            return None
            
        # Chercher dans la section "data"
        data_start = content.find('"data":{')
        data_end = content.find('}', data_start)
        if data_start != -1 and data_end != -1:
            data_section = content[data_start:data_end]
            uri_start = data_section.find('"uri":\n\nstring"')
            if uri_start != -1:
                uri_line = data_section[uri_start:].split('\n')[2]
                uri = uri_line.split('string"')[1].strip().strip('"')
                
                metadata_response = session.get(uri, timeout=30)
                if metadata_response.status_code == 200:
                    return metadata_response.json()
        
        print(f"{RED}❌ Échec de la récupération{RESET}")
        return None

    except Exception as e:
        print(f"{RED}❌ Erreur lors de la récupération{RESET}")
        return None

def create_token():
    print(f"\n🚀 Démarrage de la création du token...\n")
    
    mode = input("\n🚀 Choisissez l'option (1: Créer, 2: Copier) : ").strip()
    if mode == "2":
        token_address = input("📝 Entrez l'adresse du token à copier: ").strip()
        print(f"{YELLOW}⏳ Récupération des métadonnées...{RESET}")
        metadata_json = get_metadata_from_solana(token_address)
        
        if metadata_json:
            metadata = metadata_json.copy()
            print(f"{GREEN}✅ Métadonnées récupérées{RESET}")
            
            print(f"\n{YELLOW}⏳ Upload des métadonnées...{RESET}")
            metadata_url = upload_metadata_to_pinata(metadata)
            print(f"{GREEN}✅ Métadonnées uploadées{RESET}\n")
            
            token_name = metadata["name"]
            token_symbol = metadata["symbol"]
        else:
            print(f"{RED}❌ Impossible de récupérer les métadonnées.{RESET}")
            exit(1)
    else:
        token_name = input("📝 Nom du token: ").strip()
        token_symbol = input("🔤 Symbole du token (2 à 5 caractères): ").strip()
        if not (2 <= len(token_symbol) <= 5):
            print(f"{RED}❌ Le symbole doit contenir entre 2 et 5 caractères.{RESET}")
            exit(1)
        description = input("📖 Description du token: ").strip()
        image_url = input("🖼️ URL de l'image pour le token: ").strip()
        external_url = input("🌐 URL externe (lien vers le site web du token, ENTER pour laisser vide): ").strip()
        twitter = input("🐦 Compte Twitter (ENTER pour laisser vide): ").strip()
        telegram = input("💬 Compte Telegram (ENTER pour laisser vide): ").strip()
        attributes = []
        if twitter:
            attributes.append({"trait_type": "Twitter", "value": twitter})
        if telegram:
            attributes.append({"trait_type": "Telegram", "value": telegram})
        
        metadata = {
            "name": token_name,
            "symbol": token_symbol,
            "description": description,
            "image": image_url,
            "external_url": external_url,
            "attributes": attributes
        }
        
        print(f"\n{YELLOW}⏳ Upload des metadata sur Pinata...{RESET}")
        metadata_url = upload_metadata_to_pinata(metadata)
        print(f"{GREEN}✅ Metadata uploaded to Pinata. URL: {metadata_url}{RESET}\n")
    
    create_dockerfile()
    build_docker_image()
    
    # Remplacer les espaces dans le nom du dossier par des underscores
    dir_name = token_name.replace(" ", "_")
    os.makedirs(dir_name, exist_ok=True)
    os.chdir(dir_name)
    
    balance = check_balance()
    print(f"💰 Votre solde actuel: {balance} SOL")
    if balance < 0.075:
        print(f"{YELLOW}⚠️ Solde insuffisant, tentative d'airdrop...{RESET}")
        run_container_command("solana airdrop 1 --keypair /root/.config/solana/id.json")
        if not wait_for_account_balance("/root/.config/solana/id.json", 0.075, timeout=30, interval=3):
            print(f"{RED}❌ Solde insuffisant après airdrop{RESET}")
            exit(1)
    print(f"{GREEN}✅ Solde suffisant!{RESET}\n")
    
    run_container_command("mkdir -p /root/.config/solana/cli && solana config set --keypair /root/.config/solana/id.json")
    print(f"{GREEN}✅ Configuration mise à jour (utilise id.json){RESET}\n")
    
    run_container_command("mkdir -p solana-data")
    run_container_command("solana-keygen new --force --no-bip39-passphrase --outfile solana-data/mint.json")
    print(f"{GREEN}✅ Autorité de mint créée (mint.json){RESET}\n")
    
    if not transfer_sol_with_retry("id.json", "mint.json", 0.0035):
        exit(1)
    
    # Choix d'une adresse custom pour le mint_address
    custom_choice = input("\n🤔 Voulez-vous une adresse custom pour le token ? (y/n): ").strip().lower()
    if custom_choice == 'y':
        prefix4 = token_name[:4]
        prefix3 = token_name[:3]
        print(f"{YELLOW}🔍 Recherche d'une adresse custom...{RESET}")
        stop_event = threading.Event()
        spinner_thread = threading.Thread(target=spinner, args=(stop_event,))
        spinner_thread.start()
        success = grind_key(prefix4, 10, "solana-data/mint_address.json")
        stop_event.set()
        spinner_thread.join()
        if not success:
            print(f"{YELLOW}❌ Échec avec 4 lettres, tentative avec 3 lettres ({prefix3})...{RESET}")
            stop_event = threading.Event()
            spinner_thread = threading.Thread(target=spinner, args=(stop_event,))
            spinner_thread.start()
            success = grind_key(prefix3, 10, "solana-data/mint_address.json")
            stop_event.set()
            spinner_thread.join()
            if not success:
                print(f"{YELLOW}⚠️ Aucune adresse custom trouvée, génération normale.{RESET}")
                run_container_command("solana-keygen new --force --no-bip39-passphrase --outfile solana-data/mint_address.json")
    else:
        run_container_command("solana-keygen new --force --no-bip39-passphrase --outfile solana-data/mint_address.json")
    
    print(f"{YELLOW}⏳ Création de l'adresse de mint... (mint_address.json){RESET}")
    mint_address = run_container_command("solana-keygen pubkey /solana-token/solana-data/mint_address.json")
    print(f"{CYAN}📬 Adresse du token: {mint_address}{RESET}\n")
    
    print(f"\n🚀 Création du token...")
    run_container_command(
        f"spl-token create-token "
        f"--program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb "
        f"--enable-metadata --decimals 9 "
        f"--mint-authority /solana-token/solana-data/mint.json "
        f"--fee-payer /root/.config/solana/id.json "
        f"/solana-token/solana-data/mint_address.json"
    )
    print(f"{GREEN}✅ Token créé (utilise mint_address.json){RESET}\n")
    
    run_container_command("solana config set --keypair /solana-token/solana-data/mint.json")
    print(f"{GREEN}✅ Configuration mise à jour (utilise mint.json){RESET}\n")
    
    print(f"\n📝 Initialisation des métadonnées...")
    run_container_command(
        f"spl-token initialize-metadata {mint_address} "
        f'"{token_name}" "{token_symbol}" "{metadata_url}"'
    )
    print(f"{GREEN}✅ Métadonnées initialisées{RESET}\n")
    
    print(f"\n💼 Création du portefeuille...")
    run_container_command(
        f"spl-token create-account {mint_address} "
        "--fee-payer /root/.config/solana/id.json"
    )
    print(f"{GREEN}✅ Portefeuille créé{RESET}")
    
    supply = "1000000000"
    run_container_command(f"spl-token mint {mint_address} {supply}")
    print(f"{GREEN}✅ Tokens mintés{RESET}\n")
    
    print(f"\n🔒 Désactivation des autorités...")
    run_container_command(
        f"spl-token authorize {mint_address} mint --disable "
        "--fee-payer /root/.config/solana/id.json"
    )
    out, err = run_container_command(
        f"spl-token authorize {mint_address} freeze --disable --fee-payer /root/.config/solana/id.json",
        exit_on_error=False
    )
    print(f"{GREEN}✅ Autorités désactivées{RESET}\n")
    
    print("\n" + "-" * 40)
    elapsed = time.time() - start_time
    print(f"{GREEN}✅ Token {token_name} ({token_symbol}) créé avec succès! ({elapsed:.2f} sec){RESET}")
    print(f"{CYAN}📬 Adresse du token: {mint_address}{RESET}")
    print(f"{CYAN}Explorer: https://explorer.solana.com/address/{mint_address}?cluster=devnet{RESET}\n")
    
    print(f"{GREEN}🔑 Clé privée du mint (mint authority):{RESET}")
    key_data = run_command("sudo cat solana-data/mint.json", use_sudo=True)
    print(key_data)

def wait_for_account_balance(mint_address, expected_balance, timeout=30, interval=3):
    print(f"{YELLOW}⏳ Vérification de la propagation du mint...{RESET}")
    start = time.time()
    while time.time() - start < timeout:
        output = run_container_command(f"solana account {mint_address}", exit_on_error=False)
        if output and "AccountNotFound" not in output:
            print(f"{GREEN}✅ Propagation du mint confirmée!{RESET}")
            return True
        time.sleep(interval)
    print(f"{RED}❌ Le mint n'a pas été propagé dans le délai imparti.{RESET}")
    return False

def check_and_install_prerequisites():
    print(f"\n{YELLOW}🔍 Vérification des prérequis...{RESET}")
    
    # Vérification de Docker
    docker_check = subprocess.run("which docker", shell=True, capture_output=True)
    if docker_check.returncode != 0:
        print(f"{YELLOW}⚙️ Installation de Docker...{RESET}")
        run_command("curl -fsSL https://get.docker.com -o get-docker.sh", use_sudo=False)
        run_command("sh get-docker.sh", use_sudo=True)
        run_command("rm get-docker.sh", use_sudo=False)
        run_command("sudo usermod -aG docker $USER", use_sudo=True)
        print(f"{GREEN}✅ Docker installé avec succès!{RESET}")
    else:
        print(f"{GREEN}✅ Docker est déjà installé{RESET}")
    
    # Vérification de curl
    curl_check = subprocess.run("which curl", shell=True, capture_output=True)
    if curl_check.returncode != 0:
        print(f"{YELLOW}⚙️ Installation de curl...{RESET}")
        run_command("apt-get update && apt-get install -y curl", use_sudo=True)
        print(f"{GREEN}✅ curl installé avec succès!{RESET}")
    else:
        print(f"{GREEN}✅ curl est déjà installé{RESET}")

class TokenCreatorApp:
    def __init__(self):
        self.window = ctk.CTk()
        self.window.title("Créateur de Token Solana")
        self.window.geometry("600x800")
        
        # Configuration du thème
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")
        
        # Frame principal
        self.main_frame = ctk.CTkFrame(self.window)
        self.main_frame.pack(pady=20, padx=20, fill="both", expand=True)
        
        # Titre
        self.title_label = ctk.CTkLabel(
            self.main_frame, 
            text="Créateur de Token Solana",
            font=("Arial", 24, "bold")
        )
        self.title_label.pack(pady=20)
        
        # Mode de création avec boutons radio
        self.mode_var = ctk.StringVar(value="create")
        
        self.mode_frame = ctk.CTkFrame(self.main_frame)
        self.mode_frame.pack(pady=10, padx=10, fill="x")
        
        self.create_radio = ctk.CTkRadioButton(
            self.mode_frame,
            text="Créer un nouveau token",
            variable=self.mode_var,
            value="create",
            command=self.on_mode_change
        )
        self.create_radio.pack(side="left", padx=20)
        
        self.copy_radio = ctk.CTkRadioButton(
            self.mode_frame,
            text="Copier un token existant",
            variable=self.mode_var,
            value="copy",
            command=self.on_mode_change
        )
        self.copy_radio.pack(side="left", padx=20)
        
        # Frame pour les inputs
        self.input_frame = ctk.CTkFrame(self.main_frame)
        self.input_frame.pack(pady=20, padx=20, fill="x")
        
        # Initialisation des champs par défaut
        self.on_mode_change()
        
        # Bouton de création
        self.create_button = ctk.CTkButton(
            self.main_frame,
            text="Créer le token",
            command=self.create_token,
            width=200,
            height=40
        )
        self.create_button.pack(pady=20)
        
        # Zone de log
        self.log_text = ctk.CTkTextbox(
            self.main_frame,
            width=500,
            height=300
        )
        self.log_text.pack(pady=20, padx=20, fill="both", expand=True)
        
    def on_mode_change(self, event=None):
        # Nettoyer le frame des inputs
        for widget in self.input_frame.winfo_children():
            widget.destroy()
            
        if self.mode_var.get() == "copy":
            # Afficher uniquement le champ d'adresse
            self.token_address_label = ctk.CTkLabel(self.input_frame, text="Adresse du token à copier:")
            self.token_address_label.pack(pady=5)
            self.token_address_entry = ctk.CTkEntry(self.input_frame, width=400)
            self.token_address_entry.pack(pady=5)
        else:
            # Afficher tous les champs pour un nouveau token
            fields = [
                ("Nom du token:", "token_name"),
                ("Symbole (2-5 caractères):", "token_symbol"),
                ("Description:", "description"),
                ("URL de l'image:", "image_url"),
                ("Site web (optionnel):", "website"),
                ("Twitter (optionnel):", "twitter"),
                ("Telegram (optionnel):", "telegram")
            ]
            
            for label_text, field_name in fields:
                label = ctk.CTkLabel(self.input_frame, text=label_text)
                label.pack(pady=5)
                entry = ctk.CTkEntry(self.input_frame, width=400)
                entry.pack(pady=5)
                setattr(self, f"{field_name}_entry", entry)
    
    def create_token(self):
        # Ici nous ajouterons la logique de création du token
        pass
    
    def run(self):
        self.window.mainloop()

if __name__ == "__main__":
    app = TokenCreatorApp()
    app.run()

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { PublicKey } = require('@solana/web3.js'); // Assurez-vous d'avoir installé @solana/web3.js
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const web3 = require('@solana/web3.js');
const splToken = require('@solana/spl-token');
const { 
    createCreateMetadataAccountV3Instruction,
    PROGRAM_ID
} = require('@metaplex-foundation/mpl-token-metadata');
require('dotenv').config(); // Chargement des variables d'environnement
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const app = express();

app.use(cors({
    origin: 'http://localhost:3002',
    credentials: true
}));
app.use(express.json());

// Middleware de journalisation des requêtes
app.use((req, res, next) => {
    console.log(`🔄 Requête entrante: ${req.method} ${req.url}`);
    next();
});

// Configuration Multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Vérification des variables d'environnement
console.log('🔑 Clés API configurées :', {
    PINATA_API_KEY: !!process.env.PINATA_API_KEY,
    PINATA_SECRET_KEY: !!process.env.PINATA_SECRET_KEY,
    FIRECRAWL_API_KEY: !!process.env.FIRECRAWL_API_KEY,
    SOLANA_RPC_URL: !!process.env.SOLANA_RPC_URL,
    WALLET_PRIVATE_KEY: !!process.env.WALLET_PRIVATE_KEY
});

if (!process.env.PINATA_API_KEY || !process.env.PINATA_SECRET_KEY || !process.env.FIRECRAWL_API_KEY) {
    console.error('❌ Erreur: Des clés API sont manquantes');
    process.exit(1);
}

// Configuration des API keys
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

// Configuration Solana
const connection = new web3.Connection(
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
    'confirmed'
);

// Chargement de la clé privée du wallet créateur
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
if (!WALLET_PRIVATE_KEY) {
    console.error('❌ Erreur: Clé privée du wallet non configurée');
    process.exit(1);
}

const creatorKeypair = web3.Keypair.fromSecretKey(
    Buffer.from(JSON.parse(WALLET_PRIVATE_KEY))
);

// Fonction pour trouver Python
const findPython = () => {
  return 'python3';
};

// Fonction pour installer les dépendances Python
const installPythonDeps = () => {
  console.log('🔧 Configuration de l\'environnement Python...');
  
  try {
    // Création du dossier pour l'environnement virtuel
    const venvPath = path.join(__dirname, 'venv');
    if (!fs.existsSync(venvPath)) {
      console.log('📁 Création de l\'environnement virtuel...');
      require('child_process').execSync('python3 -m venv venv', { 
        cwd: __dirname,
        stdio: 'inherit' 
      });
    }

    // Installation des packages requis dans l'environnement virtuel
    const packages = [
      'python-dotenv',
      'requests',
      'base58'
    ];
    
    console.log('📦 Installation des dépendances Python...');
    const pipCommand = `${path.join(__dirname, 'venv/bin/pip')} install ${packages.join(' ')}`;
    require('child_process').execSync(pipCommand, { 
      cwd: __dirname,
      stdio: 'inherit' 
    });
    
    console.log('✅ Environnement Python configuré avec succès');
    return true;
  } catch (error) {
    console.error('❌ Erreur configuration Python:', error);
    return false;
  }
};

// Installer les dépendances Python au démarrage
installPythonDeps();

// Route de test
app.get('/api/test', (req, res) => {
    try {
        res.json({ message: 'Serveur opérationnel' });
    } catch (error) {
        console.error('Erreur route test:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// Route pour l'upload d'image
app.post('/api/upload-image', upload.single('file'), async (req, res) => {
    try {
        console.log('📤 Début upload image...');
        
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                error: 'Aucun fichier uploadé' 
            });
        }

        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path));

        console.log('🔄 Envoi à Pinata...');
        
        const response = await axios({
            method: 'post',
            url: 'https://api.pinata.cloud/pinning/pinFileToIPFS',
            data: formData,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET_KEY
            }
        });

        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Erreur suppression fichier:', err);
        });

        console.log('✅ Upload image réussi:', response.data);
        
        res.json({
            success: true,
            ipfsHash: response.data.IpfsHash
        });
    } catch (error) {
        console.error('❌ Erreur upload image:', error);
        res.status(500).json({
            success: false,
            error: "Erreur lors de l'upload de l'image"
        });
    }
});

// Route pour l'upload des métadonnées
app.post('/api/upload-metadata', async (req, res) => {
    try {
        console.log('📦 Début upload metadata:', req.body);
        
        const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            req.body,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_SECRET_KEY
                }
            }
        );

        console.log('✅ Upload metadata réussi:', response.data);
        
        res.json({
            success: true,
            ipfsHash: response.data.IpfsHash
        });
    } catch (error) {
        console.error('❌ Erreur upload metadata:', error);
        res.status(500).json({
            success: false,
            error: "Erreur lors de l'upload des métadonnées"
        });
    }
});

// Définition du TOKEN_METADATA_PROGRAM_ID comme PublicKey avec l'adresse directe
const TOKEN_METADATA_PROGRAM_ID = new web3.PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Ajouter une variable pour stocker la dernière progression
let lastProgressValue = 0;

async function runContainerCommand(command) {
    const currentDir = process.cwd();
    const hostConfig = `${process.env.HOME}/.config/solana`;
    const dockerCommand = `sudo docker run --rm -v ${currentDir}:/app -v ${hostConfig}:/root/.config/solana heysolana ${command}`;
    
    try {
        console.log(`Exécution de: ${dockerCommand}`);
        const { stdout, stderr } = await execPromise(dockerCommand);
        if (stderr) console.error('stderr:', stderr);
        return stdout.trim();
    } catch (error) {
        console.error('Erreur commande:', error);
        throw error;
    }
}

// Ajouter ces définitions au niveau global (juste après les imports)
const scriptPath = path.join(__dirname, 'create_token_v1.1.py');
const pythonPath = process.env.PYTHON_PATH || 'python3';

app.get('/api/token', (req, res) => {
    try {
        // Configuration des en-têtes SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        
        // Récupération des paramètres de la requête
        const { 
            mode, 
            language, 
            token_name, 
            token_symbol, 
            description, 
            image_url, 
            metadata_url, 
            website, 
            twitter, 
            telegram,
            disable_mint,
            custom_address_prefix,
            custom_address_type,
            retry
        } = req.query;
        
        console.log("Language reçu:", language);
        
        // Fonction pour envoyer la progression au client
        const sendProgress = (message, type = 'progress', progress = null) => {
            const data = {
                type: type,
                message: message,
                language: language || 'en'
            };
            
            if (progress !== null) {
                data.progress = progress;
            }
            
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        
        // Keep-alive pour la connexion SSE
        const keepAlive = setInterval(() => {
            res.write(': keep-alive\n\n');
        }, 20000);
        
        if (mode === 'create') {
            // Construire les arguments pour le script Python
            const pythonArgs = [
                scriptPath,
                '--mode', 'create',
                '--language', language || 'en',
                '--token-name', token_name,
                '--token-symbol', token_symbol,
                '--description', description || '',
                '--image-url', image_url || '',
                '--metadata-url', metadata_url || ''
            ];
            
            // Ajout des paramètres optionnels s'ils sont présents
            if (website) pythonArgs.push('--website', website);
            if (twitter) pythonArgs.push('--twitter', twitter);
            if (telegram) pythonArgs.push('--telegram', telegram);
            
            // Au début du traitement de la requête
            console.log("Received disable_mint value:", disable_mint, typeof disable_mint);

            // Avant d'ajouter l'argument
            if (disable_mint === 'true' || disable_mint === true) {
                console.log("Adding --disable-mint argument");
                pythonArgs.push('--disable-mint');
            } else {
                console.log("Skipping --disable-mint argument");
            }

            // Ajout du paramètre custom_address_prefix
            if (custom_address_prefix) {
                console.log("Adding custom address prefix:", custom_address_prefix);
                pythonArgs.push('--custom-address-prefix', custom_address_prefix);
                
                // Si c'est une reprise, ajouter le paramètre retry
                if (retry === 'true' || retry === true) {
                    console.log("Adding retry parameter");
                    pythonArgs.push('--retry');
                    
                    // Définir explicitement le nombre maximum de tentatives pour la reprise
                    // S'assurer que c'est toujours 100, même pour la reprise
                    pythonArgs.push('--max-attempts', '100');
                } else {
                    // Pour la première recherche, également définir max-attempts à 100
                    pythonArgs.push('--max-attempts', '100');
                }
            }
            
            // Ajouter le type d'adresse (starts-with ou ends-with)
            if (custom_address_type) {
                console.log("Custom address type:", custom_address_type);
                pythonArgs.push('--custom-address-type', custom_address_type);
            }
            
            // Log des arguments complets
            console.log("Python args:", pythonArgs);

            console.log('Lancement du script Python avec arguments:', pythonArgs);

            const pythonProcess = spawn(pythonPath, pythonArgs);

            pythonProcess.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                
                for (const line of lines) {
                    try {
                        console.log('📤 Message du script:', line);
                        let parsedData = JSON.parse(line);
                        let modifiedLine = line;
                        
                        // Traitement spécial pour les messages de timeout
                        if (parsedData.type === 'timeout') {
                            console.log('⚠️ TIMEOUT DÉTECTÉ, envoi au client');
                            
                            // S'assurer que le message est envoyé immédiatement au client
                            res.write(`data: ${modifiedLine}\n\n`);
                            
                            // Ne pas terminer la connexion ici, laisser l'utilisateur décider
                            continue;
                        }
                        
                        // Stocker la progression pour les messages de type progress
                        if (parsedData.type === 'progress' && parsedData.progress) {
                            lastProgressValue = parsedData.progress;
                            console.log(`Progression mise à jour: ${lastProgressValue}%`);
                        }
                        
                        // Ajustement spécial pour la reprise de recherche
                        if (parsedData.type === 'progress') {
                            // Si c'est un message de reprise de recherche, utiliser la dernière progression connue
                            if (parsedData.message.includes('Continuing custom address search') || 
                                parsedData.message.includes('Recherche approfondie d\'adresse')) {
                                
                                console.log(`Ajustement de la progression pour la reprise de recherche: ${lastProgressValue} -> 60%`);
                                
                                // Forcer la progression à 60% pour la reprise
                                parsedData.progress = 60;
                                
                                // Mettre à jour la ligne avec la nouvelle progression
                                modifiedLine = JSON.stringify(parsedData);
                                
                                // Envoyer immédiatement ce message pour s'assurer qu'il est traité en premier
                                res.write(`data: ${modifiedLine}\n\n`);
                                continue; // Passer au message suivant
                            }
                        }
                        
                        // Traitement spécial pour les résultats finaux
                        if (parsedData.type === 'result') {
                            console.log('✅ RÉSULTAT FINAL REÇU, envoi au client');
                            res.write(`data: ${modifiedLine}\n\n`);
                            
                            // Terminer proprement la connexion après l'envoi du résultat
                            setTimeout(() => {
                                clearInterval(keepAlive);
                                res.end();
                            }, 1000);
                            
                            // Terminer le processus Python si nécessaire
                            try {
                                if (pythonProcess && !pythonProcess.killed) {
                                    pythonProcess.kill();
                                }
                            } catch (e) {
                                console.error('Erreur lors de la terminaison du processus Python:', e);
                            }
                            
                            return;
                        }
                        
                        // Traitement normal pour les autres messages
                        res.write(`data: ${modifiedLine}\n\n`);
                    } catch (error) {
                        console.error('Erreur parsing JSON:', error);
                    }
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error('⚠️ Erreur Python:', data.toString());
            });

            pythonProcess.on('exit', (code) => {
                console.log(`Processus Python terminé avec code: ${code}`);
                
                // Si le processus se termine sans avoir envoyé de résultat final,
                // fermer proprement la connexion SSE
                setTimeout(() => {
                    clearInterval(keepAlive);
                    if (!res.finished) {
                        res.end();
                    }
                }, 1000);
            });

        } else if (mode === 'copy') {
            const { tokenAddress } = req.query;
            if (!tokenAddress) {
                sendProgress("❌ Erreur: Adresse du token manquante", 'error');
                res.end();
                return;
            }

            sendProgress("🚀 Démarrage de la copie du token...");

            // Construction de la commande Python avec la langue pour le mode copy
            const pythonArgs = [
                scriptPath,
                '--mode', 'copy',
                '--language', language,
                '--token-address', tokenAddress,
                '--firecrawl-api-key', process.env.FIRECRAWL_API_KEY
            ];

            // Ajout du paramètre disable_mint si nécessaire
            if (disable_mint === 'true' || disable_mint === true) {
                console.log("Désactivation du mint activée");  // Log pour debug
                pythonArgs.push('--disable-mint');
            }

            // Ajout du paramètre custom_address_prefix
            if (custom_address_prefix) {
                console.log("Adding custom address prefix:", custom_address_prefix);
                pythonArgs.push('--custom-address-prefix', custom_address_prefix);
            }

            // Ajouter le type d'adresse (starts-with ou ends-with)
            if (custom_address_type) {
                console.log("Custom address type:", custom_address_type);
                pythonArgs.push('--custom-address-type', custom_address_type);
            }

            console.log('Lancement du script Python avec arguments:', pythonArgs);
            const pythonProcess = spawn(pythonPath, pythonArgs);

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log('📤 Message du script:', output);
                
                try {
                    const jsonData = JSON.parse(output);
                    res.write(`data: ${JSON.stringify(jsonData)}\n\n`);
                    
                    if (jsonData.type === 'result' || jsonData.type === 'error') {
                        clearInterval(keepAlive);
                        res.end();
                    }
                } catch (e) {
                    console.log('Logs Python:', output);
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                console.error('⚠️ Erreur Python:', data.toString());
            });

            pythonProcess.on('exit', (code) => {
                console.log(`Processus Python terminé avec code: ${code}`);
                
                // Si le processus se termine sans avoir envoyé de résultat final,
                // fermer proprement la connexion SSE
                setTimeout(() => {
                    clearInterval(keepAlive);
                    if (!res.finished) {
                        res.end();
                    }
                }, 1000);
            });
        }
    } catch (error) {
        console.error('❌ Erreur:', error);
        sendProgress(`❌ Erreur: ${error.message}`, 'error');
        clearInterval(keepAlive);
        res.end();
    }
});

// Route pour récupérer les métadonnées
app.get('/api/get-metadata', async (req, res) => {
  const { address } = req.query;
  
  if (!address) {
    return res.status(400).json({ 
      success: false, 
      error: 'Adresse du token requise' 
    });
  }

  try {
    console.log(`🔍 Récupération des métadonnées pour le token: ${address}`);
    
    // Utiliser la fonction de scraping existante
    const metadata = await scrapeTokenMetadata(address);
    
    // Renvoyer les métadonnées
    return res.json({
      success: true,
      metadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description || '',
        image: metadata.image || '',
        metadata_url: metadata.metadata_url,
        address: address,
        explorer_url: `https://explorer.solana.com/address/${address}?cluster=devnet`
      }
    });
  } catch (error) {
    console.error('❌ Erreur récupération métadonnées:', error);
    return res.status(500).json({
      success: false,
      error: `Impossible de récupérer les métadonnées: ${error.message}`
    });
  }
});

// Fonction pour scraper les métadonnées via Firecrawl
async function scrapeTokenMetadata(tokenAddress) {
    try {
        console.log('\n[DEBUG] ====== DÉBUT SCRAPING ======');
        console.log('[DEBUG] Token Address:', tokenAddress);

        const explorerUrl = `https://explorer.solana.com/address/${tokenAddress}/metadata`;
        console.log('[DEBUG] URL Explorer:', explorerUrl);

        const requestBody = {
            url: explorerUrl,
            formats: ['markdown'],
            actions: [
                { type: "wait", milliseconds: 4000 },
                { 
                    type: "scrape",
                    selector: ".card-metaplex-metadata"
                }
            ]
        };

        const firecrawlConfig = {
            method: 'post',
            url: 'https://api.firecrawl.dev/v1/scrape',
            headers: {
                'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            data: requestBody
        };

        console.log('[DEBUG] Envoi de la requête Firecrawl...');
        const response = await axios(firecrawlConfig);
        console.log('[DEBUG] Réponse brute:', response.data);

        // Extraire l'URL IPFS avec la regex qui fonctionnait
        const markdown = response.data.data.markdown;
        const ipfsMatch = markdown.match(/string"(https:\/\/[^\"]+)"/);
        if (!ipfsMatch) {
            throw new Error("URL IPFS non trouvée dans la réponse");
        }

        const ipfsUrl = ipfsMatch[1];
        console.log('[DEBUG] URL IPFS trouvée:', ipfsUrl);

        // Récupérer les métadonnées avec des headers appropriés
        console.log('[DEBUG] Récupération des métadonnées depuis:', ipfsUrl);
        const metadataResponse = await axios.get(ipfsUrl, {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const metadata = metadataResponse.data;
        console.log('[DEBUG] Métadonnées récupérées:', metadata);

        // Retourner les métadonnées avec l'URL IPFS originale
        return {
            name: metadata.name,
            symbol: metadata.symbol,
            description: metadata.description,
            image: metadata.image,
            metadata_url: ipfsUrl,  // On garde l'URL IPFS originale
            website: metadata.website || '',
            twitter: metadata.twitter || '',
            telegram: metadata.telegram || '',
            discord: metadata.discord || '',
            github: metadata.github || '',
            medium: metadata.medium || '',
            reddit: metadata.reddit || ''
        };

    } catch (error) {
        console.error('[DEBUG] ====== ERREUR DÉTAILLÉE ======');
        console.error('[DEBUG] Message:', error.message);
        console.error('[DEBUG] Response:', error.response?.data);
        console.error('[DEBUG] Status:', error.response?.status);
        console.error('[DEBUG] Stack:', error.stack);
        throw new Error(`Erreur Firecrawl: ${error.message}`);
    }
}

// Mise à jour de la route copy-token
app.get('/api/copy-token', async (req, res) => {
  // Configuration des en-têtes pour SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { address, metadata_url } = req.query;
    
    if (!address) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Adresse du token requise' })}\n\n`);
      res.end();
      return;
    }
    
    // Fonction pour envoyer les événements de progression
    const sendProgress = (message, type = 'progress') => {
      res.write(`data: ${JSON.stringify({ type, message })}\n\n`);
    };
    
    sendProgress("🚀 Démarrage de la copie du token");
    
    try {
      // 1. Récupérer les métadonnées si elles ne sont pas déjà fournies
      let tokenMetadata;
      if (metadata_url) {
        sendProgress("✅ Utilisation des métadonnées fournies");
        // Récupérer les métadonnées depuis l'URL fournie
        try {
          const metadataResponse = await axios.get(metadata_url);
          tokenMetadata = metadataResponse.data;
          tokenMetadata.metadata_url = metadata_url;
        } catch (error) {
          console.error('Erreur récupération métadonnées depuis URL:', error);
          sendProgress("🔍 Récupération des métadonnées depuis l'explorateur...");
          tokenMetadata = await scrapeTokenMetadata(address);
        }
      } else {
        sendProgress("🔍 Récupération des métadonnées...");
        tokenMetadata = await scrapeTokenMetadata(address);
      }
      
      sendProgress("✅ Métadonnées récupérées avec succès");
      console.log("Métadonnées utilisées pour la création:", tokenMetadata);
      
      // 2. Créer le token
      sendProgress("⚙️ Configuration du wallet Solana...");
      
      // Configuration du wallet
      await runContainerCommand('solana config set --url https://api.devnet.solana.com');
      await runContainerCommand('solana config set --keypair /root/.config/solana/id.json');
      
      sendProgress("💰 Vérification du solde du wallet...");
      
      // Création du token
      sendProgress("🔨 Création du token sur la blockchain...");
      const createOutput = await runContainerCommand(
        'spl-token create-token ' +
        '--program-id TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb ' +
        '--enable-metadata ' +
        '--decimals 9'
      );
      
      // Extraction de l'adresse du token
      const mintAddress = createOutput.match(/Creating token ([a-zA-Z0-9]+)/)?.[1];
      if (!mintAddress) {
        throw new Error("Impossible de récupérer l'adresse du token");
      }
      
      sendProgress(`🔑 Token créé avec l'adresse: ${mintAddress}`);
      
      // Création du compte
      sendProgress("📝 Création du compte token...");
      await runContainerCommand(`spl-token create-account ${mintAddress}`);
      
      // Mint des tokens
      sendProgress("💎 Mint des tokens en cours...");
      await runContainerCommand(`spl-token mint ${mintAddress} 1000000000`);
      
      // Configuration des métadonnées
      sendProgress("📋 Configuration des métadonnées...");
      await runContainerCommand(
        `spl-token initialize-metadata ${mintAddress} "${tokenMetadata.name}" "${tokenMetadata.symbol}" "${tokenMetadata.metadata_url}"`
      );
      
      // Désactivation du mint
      sendProgress("🔒 Désactivation du mint...");
      try {
        await runContainerCommand(`spl-token authorize ${mintAddress} mint --disable`);
      } catch (error) {
        console.log('Note: Erreur ignorée lors de la désactivation du mint');
      }
      
      // Réponse finale
      const explorerUrl = `https://explorer.solana.com/address/${mintAddress}?cluster=devnet`;
      sendProgress("✨ Token créé avec succès !");
      
      // Envoyer le résultat final
      res.write(`data: ${JSON.stringify({ 
        type: 'result',
        success: true,
        metadata: {
          name: tokenMetadata.name,
          symbol: tokenMetadata.symbol,
          description: tokenMetadata.description || '',
          image: tokenMetadata.image || '',
          address: mintAddress,
          explorer_url: explorerUrl,
          metadata_url: tokenMetadata.metadata_url,
          website: tokenMetadata.website || '',
          twitter: tokenMetadata.twitter || '',
          telegram: tokenMetadata.telegram || '',
          discord: tokenMetadata.discord || '',
          github: tokenMetadata.github || '',
          medium: tokenMetadata.medium || '',
          reddit: tokenMetadata.reddit || ''
        }
      })}\n\n`);
      
      res.end();
      
    } catch (error) {
      console.error('Erreur création token:', error);
      sendProgress(`❌ Erreur: ${error.message}`, 'error');
      res.end();
    }
    
  } catch (error) {
    console.error('❌ Erreur globale:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

// Nouvel endpoint pour la création de token (sans SSE)
app.post('/api/create-token', upload.single('image'), async (req, res) => {
  try {
    console.log('🚀 Démarrage du processus de création de token');
    console.log('Paramètres reçus:', req.body);
    
    const { tokenName, tokenSymbol, description, website, twitter, telegram } = req.body;
    
    if (!tokenName || !tokenSymbol || !req.file) {
      return res.status(400).json({
        success: false,
        error: 'Tous les champs obligatoires doivent être remplis'
      });
    }
    
    // Chemin du fichier image uploadé
    const imagePath = req.file.path;
    console.log(`📷 Image reçue: ${imagePath}`);
    
    // Préparation des arguments pour le script Python
    const pythonPath = process.env.PYTHON_PATH || findPython();
    const scriptPath = path.join(__dirname, 'create_token_v1.1.py');
    
    const pythonArgs = [
      scriptPath,
      '--mode', 'create',
      '--token-name', tokenName,
      '--token-symbol', tokenSymbol,
      '--description', description || '',
      '--image-path', imagePath
    ];
    
    // Ajout des clés API
    if (process.env.PINATA_API_KEY) {
      pythonArgs.push('--pinata-api-key', process.env.PINATA_API_KEY);
      pythonArgs.push('--pinata-secret-key', process.env.PINATA_SECRET_KEY);
    }
    
    if (process.env.FIRECRAWL_API_KEY) {
      pythonArgs.push('--firecrawl-api-key', process.env.FIRECRAWL_API_KEY);
    }
    
    // Ajout des liens sociaux
    if (website) pythonArgs.push('--website', website);
    if (twitter) pythonArgs.push('--twitter', twitter);
    if (telegram) pythonArgs.push('--telegram', telegram);
    
    // Vérifier et logger la langue
    console.log("Langue utilisée pour le script Python:", req.body.language || 'en');

    console.log('Lancement du script Python avec arguments:', pythonArgs);
    
    // Exécution du script Python
    const { stdout, stderr } = await execPromise(`${pythonPath} ${pythonArgs.join(' ')}`);
    
    // Traitement de la sortie
    console.log('Sortie Python:', stdout);
    if (stderr) console.error('Erreurs Python:', stderr);
    
    // Analyser les résultats
    const lines = stdout.split('\n');
    let resultJSON = null;
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result') {
          resultJSON = parsed;
        } else if (parsed.type === 'error') {
          throw new Error(parsed.error);
        }
      } catch (e) {
        // Ignorer les lignes qui ne sont pas du JSON valide
      }
    }
    
    // Nettoyer le fichier image temporaire
    try {
      fs.unlinkSync(imagePath);
      console.log(`🧹 Fichier temporaire supprimé: ${imagePath}`);
    } catch (err) {
      console.error('Erreur lors de la suppression du fichier temporaire:', err);
    }
    
    if (resultJSON) {
      res.json({
        success: true,
        metadata: resultJSON.metadata
      });
    } else {
      throw new Error('Aucun résultat valide n\'a été retourné par le script');
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Ajoutez cette nouvelle route pour tester le mécanisme de timeout
app.get('/api/check-timeout', (req, res) => {
  console.log("🧪 Test du mécanisme de timeout");
  
  // Répondre immédiatement avec un message de confirmation
  res.json({
    success: true,
    message: "Cette route fonctionne correctement. Utilisez /api/test-timeout pour simuler un timeout."
  });
});

// Route pour simuler un timeout
app.get('/api/test-timeout', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  console.log("🧪 Simulation d'un timeout");
  
  // Envoyer un message de progression
  res.write(`data: ${JSON.stringify({
    type: 'progress',
    message: '🔍 Searching for custom address...',
    progress: 10,
    language: req.query.language || 'en'
  })}\n\n`);
  
  // Simuler un délai puis envoyer un message de timeout
  setTimeout(() => {
    console.log("🧪 Envoi du message de timeout simulé");
    res.write(`data: ${JSON.stringify({
      type: 'timeout',
      message: 'Custom address search timeout (TEST)',
      language: req.query.language || 'en'
    })}\n\n`);
    
    // Donner le temps au client de recevoir le message
    setTimeout(() => {
      res.end();
    }, 1000);
  }, 2000);
});

// Ajouter cette route pour le téléchargement des fichiers keypair
app.get('/api/download-keypair', (req, res) => {
  try {
    const { address } = req.query;
    
    if (!address) {
      return res.status(400).json({ error: 'Address parameter is required' });
    }
    
    // Chemin vers le fichier keypair
    const keypairPath = path.join(__dirname, 'keypairs', `${address}.json`);
    
    console.log(`Tentative de téléchargement du fichier: ${keypairPath}`);
    
    // Vérifier si le fichier existe
    if (!fs.existsSync(keypairPath)) {
      console.error(`Fichier non trouvé: ${keypairPath}`);
      return res.status(404).json({ error: 'Keypair file not found' });
    }
    
    // Configurer les en-têtes pour le téléchargement
    res.setHeader('Content-Disposition', `attachment; filename=${address}.json`);
    res.setHeader('Content-Type', 'application/json');
    
    // Envoyer le fichier
    const fileStream = fs.createReadStream(keypairPath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Erreur lors du téléchargement du keypair:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Gestion des erreurs non capturées
process.on('uncaughtException', (error) => {
    console.error('Erreur non capturée:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Promesse rejetée non gérée:', error);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', (error) => {
    if (error) {
        console.error('❌ Erreur au démarrage du serveur:', error);
        return;
    }
    console.log(`
    =================================
    🚀 Serveur démarré avec succès!
    📡 Port: ${PORT}
    🌐 URL: http://localhost:${PORT}
    =================================
    `);
}); 
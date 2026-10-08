import React, { useState, useContext, useEffect } from 'react';
import './TokenForm.css';
import ProgressOverlay from './ProgressOverlay';
import { LanguageContext } from '../contexts/LanguageContext';
import TokenReport from './TokenReport';

const API_URL = 'http://localhost:3001/api';

const translations = {
  en: {
    createToken: "Create a token",
    copyToken: "Copy a token",
    newToken: "New Token",
    copyExisting: "Copy Token",
    basicInfo: "Basic Information",
    tokenName: "Token Name",
    symbol: "Symbol",
    description: "Describe your token...",
    mediaSection: "Image & Media",
    tokenImage: "Token Image",
    chooseImage: "Choose a file",
    socialLinks: "Links & Social Media",
    website: "Website",
    twitter: "Twitter",
    telegram: "Telegram",
    copyAddress: "Token Address to Copy",
    enterAddress: "Enter the Solana token address to copy",
    createButton: "Create Token",
    copyButton: "Copy Token",
    uploadImageText: "Click or drag an image here",
    progressSteps: {
      init: "Initialization...",
      start: "🚀 Starting token creation...",
      configWallet: "⚙️ Configuring Solana wallet...",
      checkBalance: "💰 Checking wallet balance...",
      createToken: "🔨 Creating token on blockchain...",
      tokenAddress: "🔑 Token created with address: {address}",
      createAccount: "📝 Creating token account...",
      minting: "💎 Minting tokens...",
      metadata: "📋 Configuring metadata...",
      disableMint: "🔒 Disabling mint...",
      success: "✨ Token created successfully!",
      copy: {
        init: "Initialization...",
        start: "🚀 Starting token copy...",
        metadata: "🔍 Extracting metadata...",
        finalizing: "✨ Finalizing...",
        success: "✨ Token copied successfully!"
      }
    },
    disableMint: "Disable mint authority (+0.1 SOL)",
    customAddress: "Custom address",
    customAddressPlaceholder: "Enter prefix (max 4 chars)",
    customAddressExample: '"lazy" for lazy*find_address*',
    continueSearch: "Continue searching?",
    useRandomAddress: "Use random address",
    timeoutMessage: "Search timeout. Would you like to continue searching or use a random address?",
    customAddressExampleStart: "Example: address starting with",
    customAddressExampleEnd: "Example: address ending with",
    customAddressPreview: "Preview:",
  },
  fr: {
    createToken: "Créer un token",
    copyToken: "Copier un token",
    newToken: "Nouveau Token",
    copyExisting: "Copier un Token",
    basicInfo: "Informations de base",
    tokenName: "Nom du Token",
    symbol: "Symbole",
    description: "Décrivez votre token...",
    mediaSection: "Image & Médias",
    tokenImage: "Image du Token",
    chooseImage: "Choisir une image",
    socialLinks: "Liens & Réseaux sociaux",
    website: "Site Web",
    twitter: "Twitter",
    telegram: "Telegram",
    copyAddress: "Adresse du Token à copier",
    enterAddress: "Entrez l'adresse du token Solana à copier",
    createButton: "Créer le Token",
    copyButton: "Copier le Token",
    progressSteps: {
      init: "Initialisation...",
      start: "🚀 Démarrage de la création du token...",
      configWallet: "⚙️ Configuration du wallet Solana...",
      checkBalance: "💰 Vérification du solde du wallet...",
      createToken: "🔨 Création du token sur la blockchain...",
      tokenAddress: "🔑 Token créé avec l'adresse: {address}",
      createAccount: "📝 Création du compte token...",
      minting: "💎 Mint des tokens en cours...",
      metadata: "📋 Configuration des métadonnées...",
      disableMint: "🔒 Désactivation du mint...",
      success: "✨ Token créé avec succès !",
      copy: {
        init: "Initialisation...",
        start: "🚀 Démarrage de la copie du token...",
        metadata: "🔍 Extraction des métadonnées...",
        finalizing: "✨ Finalisation...",
        success: "✨ Token copié avec succès !"
      }
    },
    disableMint: "Désactiver l'autorité de mint (+0.1 SOL)",
    customAddress: "Adresse personnalisée",
    customAddressPlaceholder: "Préfixe (max 4 chars)",
    customAddressExample: '"lazy" pour lazy*trouver_adresse*',
    continueSearch: "Continuer la recherche ?",
    useRandomAddress: "Utiliser une adresse aléatoire",
    timeoutMessage: "Délai dépassé. Voulez-vous continuer la recherche ou utiliser une adresse aléatoire ?",
    customAddressExampleStart: "Exemple: adresse commençant par",
    customAddressExampleEnd: "Exemple: adresse se terminant par",
    customAddressPreview: "Aperçu:",
  }
};

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 2000;

const TokenForm = ({ walletConnected, network, onTokenCreated }) => {
  const { language } = useContext(LanguageContext);
  const t = translations[language];
  const [mode, setMode] = useState('create');
  const [formData, setFormData] = useState({
    tokenName: '',
    tokenSymbol: '',
    description: '',
    imageFile: null,
    website: '',
    twitter: '',
    telegram: '',
    tokenAddress: '',
    disableMint: false,
    useCustomAddress: false,
    customAddressPrefix: '',
    customAddressType: 'starts-with',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const [showForm, setShowForm] = useState(true);
  const [showTimeoutDialog, setShowTimeoutDialog] = useState(false);
  const [timeoutMessage, setTimeoutMessage] = useState(language === 'fr' 
    ? "Délai dépassé. Voulez-vous continuer la recherche ou utiliser une adresse aléatoire ?" 
    : "Search timeout. Would you like to continue searching or use a random address?"
  );

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e) => {
    setFormData(prev => ({ ...prev, imageFile: e.target.files[0] }));
  };

  const updateProgress = (newProgress, status) => {
    setProgress(newProgress);
    setStatus(status);
  };

  const handleCopyMetadata = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setStatus(t.progressSteps.copy.init);
    
    try {
      const response = await fetch(`${API_URL}/get-metadata?address=${formData.tokenAddress}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la récupération des métadonnées");
      }
      
      const eventSource = new EventSource(`${API_URL}/get-metadata?address=${formData.tokenAddress}`);
      
      window.tokenEventSource = eventSource;
      
      eventSource.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        
        switch(data.type) {
          case 'progress':
            setStatus(data.message);
            setProgress(calculateProgress(data.message));
            break;
          
          case 'result':
            if (data.success && data.metadata) {
              setMetadata(data.metadata);
              setStatus(t.progressSteps.copy.success);
              setProgress(100);
              eventSource.close();
              setLoading(false);
            }
            break;
          
          case 'error':
            throw new Error(data.error);
        }
      };
      
      eventSource.onerror = (error) => {
        setError('Erreur de connexion au serveur lors de la récupération des métadonnées');
        setLoading(false);
        eventSource.close();
      };
      
    } catch (error) {
      console.error('Erreur:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const handleCreateToken = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setStatus(t.progressSteps.create.init);
    
    try {
      const tokenData = {
        tokenName: metadata.name,
        tokenSymbol: metadata.symbol,
        metadata_url: metadata.metadata_url,
        description: metadata.description,
        image_url: metadata.image
      };
      
      const response = await fetch(`${API_URL}/create-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokenData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la création du token");
      }
      
      const result = await response.json();
      
      if (result.success) {
        onTokenCreated(result.metadata);
        setProgress(100);
        setStatus(t.progressSteps.create.success);
      } else {
        throw new Error(result.error || "Erreur inconnue lors de la création du token");
      }
      
    } catch (error) {
      console.error('Erreur:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (message) => {
    const progressSteps = {
      'Initialisation': 5,
      'Métadonnées récupérées': 20,
      'Configuration du wallet': 35,
      'Création du token': 50,
      'Token créé': 65,
      'Création du compte': 75,
      'Mint des tokens': 85,
      'Configuration des métadonnées': 90,
      'Désactivation du mint': 95,
      'Token créé avec succès': 100,
      'Token copié avec succès': 100
    };

    for (const [step, value] of Object.entries(progressSteps)) {
      if (message.includes(step)) {
        return value;
      }
    }

    if (message.includes('récupér')) return 20;
    if (message.includes('config')) return 35;
    if (message.includes('créa')) return 50;
    if (message.includes('mint')) return 85;
    if (message.includes('succès')) return 100;

    return Math.max(progress, 10);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setProgress(0);
    setError(null);
    
    try {
      if (mode === 'create') {
        if (!formData.imageFile) {
          throw new Error("Veuillez sélectionner une image");
        }

        // 1. Upload de l'image
        console.log("📤 Début upload image...");
        setStatus("📤 Upload de l'image...");
        setProgress(20);
        
        const formDataUpload = new FormData();
        formDataUpload.append('file', formData.imageFile);

        console.log("Envoi de la requête upload image vers:", `${API_URL}/upload-image`);
        const uploadResponse = await fetch(`${API_URL}/upload-image`, {
          method: 'POST',
          body: formDataUpload
        });

        if (!uploadResponse.ok) {
          throw new Error("Erreur lors de l'upload de l'image");
        }

        const uploadResult = await uploadResponse.json();
        console.log("Résultat upload image:", uploadResult);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Erreur lors de l'upload de l'image");
        }

        const imageUrl = `https://ipfs.io/ipfs/${uploadResult.ipfsHash}`;

        // Stocker l'URL de l'image dans l'état global pour la réutiliser
        setFormData(prevData => ({
          ...prevData,
          imageIpfsUrl: imageUrl
        }));

        // 2. Création et upload des métadonnées
        console.log("🚀 Début création métadonnées...");
        setStatus("📝 Création des métadonnées...");
        setProgress(40);

        const metadataToUpload = {
          name: formData.tokenName,
          symbol: formData.tokenSymbol,
          description: formData.description || '',
          image: imageUrl,
          website: formData.website || '',
          twitter: formData.twitter || '',
          telegram: formData.telegram || ''
        };

        console.log("Métadonnées à uploader:", metadataToUpload);
        const metadataResponse = await fetch(`${API_URL}/upload-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(metadataToUpload)
        });

        if (!metadataResponse.ok) {
          throw new Error("Erreur lors de l'upload des métadonnées");
        }

        const metadataResult = await metadataResponse.json();
        console.log("Résultat upload métadonnées:", metadataResult);

        if (!metadataResult.success) {
          throw new Error(metadataResult.error || "Erreur lors de l'upload des métadonnées");
        }

        const metadataUrl = `https://ipfs.io/ipfs/${metadataResult.ipfsHash}`;

        // Stocker l'URL des métadonnées dans l'état global pour la réutiliser
        setFormData(prevData => ({
          ...prevData,
          metadataIpfsUrl: metadataUrl
        }));

        // 3. Création du token via SSE
        console.log("🚀 Début création token...");
        setStatus("🚀 Création du token...");
        setProgress(60);

        const params = new URLSearchParams({
          mode: 'create',
          language: language,
          token_name: formData.tokenName,
          token_symbol: formData.tokenSymbol,
          description: formData.description || '',
          image_url: imageUrl,
          metadata_url: metadataUrl,
          website: formData.website || '',
          twitter: formData.twitter || '',
          telegram: formData.telegram || '',
          discord: formData.discord || '',
          github: formData.github || '',
          medium: formData.medium || '',
          reddit: formData.reddit || '',
          disable_mint: formData.disableMint.toString(),
          custom_address_prefix: formData.useCustomAddress ? formData.customAddressPrefix : '',
          custom_address_type: formData.customAddressType,
        });
        console.log("disable_mint value:", formData.disableMint.toString());

        console.log("Paramètres de création:", Object.fromEntries(params));
        
        // UTILISATION DIRECTE DE FETCH POUR DEBUG
        const testFetch = await fetch(`${API_URL}/check-timeout?${params.toString()}`);
        const testResult = await testFetch.json();
        console.log("Test de la route check-timeout:", testResult);
        
        // Création d'une connexion SSE simplifiée
        console.log("Création d'une nouvelle connexion SSE à", `${API_URL}/token?${params.toString()}`);
        const eventSource = new EventSource(`${API_URL}/token?${params.toString()}`);
        
        eventSource.onmessage = function(event) {
          console.log("→ REÇU (onmessage):", event.data);
          
          try {
            const data = JSON.parse(event.data);
            
            console.log("→ PARSED:", data.type);
            
            if (data.type === "timeout") {
              console.log("🚨 TIMEOUT DÉTECTÉ:", data.message);
              eventSource.close();
              setLoading(false);
              setShowTimeoutDialog(true);
              
              if (data.message && data.message.includes("Maximum attempts")) {
                setTimeoutMessage("La limite de tentatives a été atteinte. Souhaitez-vous continuer la recherche?");
              }
              return;
            }
            
            // Traitement normal
            if (data.type === 'progress') {
              updateProgress(data.progress || 0, data.message);
            } else if (data.type === 'result') {
              eventSource.close();
              setMetadata(data.metadata);
              setShowForm(false);
              setLoading(false);
              if (onTokenCreated) {
                onTokenCreated(data.metadata);
              }
            } else if (data.type === 'error') {
              eventSource.close();
              setError(data.error);
              setLoading(false);
            }
          } catch (e) {
            console.error("Erreur de parsing:", e);
          }
        };
        
        eventSource.onerror = function(error) {
          console.error("❌ ERREUR SSE:", error);
          eventSource.close();
          setError("Erreur de connexion au serveur");
          setLoading(false);
        };
        
        window.tokenEventSource = eventSource;
      } else {
        // Mode copie
        if (!formData.tokenAddress) {
          setError('Veuillez entrer une adresse de token');
          setLoading(false);
          return;
        }
        
        const params = new URLSearchParams({
          mode: 'copy',
          language: language,
          tokenAddress: formData.tokenAddress,
          disable_mint: formData.disableMint.toString(),
          custom_address_prefix: formData.useCustomAddress ? formData.customAddressPrefix : '',
          custom_address_type: formData.customAddressType,
        });
        
        setupEventSource(`${API_URL}/token`, params);
      }
    } catch (error) {
      console.error("Erreur globale:", error);
      setError(error.message || "Une erreur s'est produite");
      setLoading(false);
    }
  };

  const setupEventSource = (url, params) => {
    try {
      const eventSource = new EventSource(`${url}?${params.toString()}`);
      window.tokenEventSource = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Message SSE reçu:', data);
          
          // Traitement spécial pour les messages de timeout
          if (data.type === 'timeout') {
            console.log('⚠️ Timeout détecté:', data.message);
            
            // Fermer la connexion SSE
            eventSource.close();
            window.tokenEventSource = null;
            
            // Afficher la boîte de dialogue de timeout
            setTimeoutMessage(data.message);
            setShowTimeoutDialog(true);
            setLoading(false);
            return;
          }

          if (data.type === 'progress') {
            updateProgress(data.progress || 0, data.message);
          } else if (data.type === 'result') {
            setMetadata(data.metadata);
            setShowForm(false);
            setLoading(false);
            if (onTokenCreated) {
              onTokenCreated(data.metadata);
            }
          } else if (data.type === 'error') {
            setError(data.error);
            setLoading(false);
          }
        } catch (error) {
          console.error('Erreur parsing SSE:', error);
        }
      };

      eventSource.onopen = () => {
        console.log('✅ Connexion SSE établie');
        setError(null);
      };

      eventSource.onerror = (error) => {
        console.error('❌ Erreur SSE:', error);
        
        if (window.tokenEventSource.readyState === EventSource.CLOSED) {
          console.error('Connexion SSE fermée');
          
          if (loading && reconnectCount < MAX_RECONNECT_ATTEMPTS) {
            console.log(`Tentative de reconnexion ${reconnectCount + 1}/${MAX_RECONNECT_ATTEMPTS}`);
            setReconnectCount(prev => prev + 1);
            setStatus(`Connexion perdue. Tentative de reconnexion ${reconnectCount + 1}/${MAX_RECONNECT_ATTEMPTS}...`);
            setTimeout(() => {
              setupEventSource(url, params);
            }, RECONNECT_DELAY);
          } else if (reconnectCount >= MAX_RECONNECT_ATTEMPTS) {
            setError('Impossible de se connecter au serveur après plusieurs tentatives');
            setLoading(false);
          }
        }
      };

      eventSource.addEventListener('heartbeat', (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastHeartbeat(data.timestamp);
          console.log('💓 Heartbeat reçu:', new Date(data.timestamp).toISOString());
        } catch (e) {
          console.error('Erreur de parsing du heartbeat:', e);
        }
      });
    } catch (error) {
      console.error('Erreur SSE:', error);
    }
  };

  const handleContinueSearch = () => {
    console.log("🔄 Reprise de la recherche d'adresse personnalisée...");
    setShowTimeoutDialog(false);
    setLoading(true);
    
    // Forcer la progression à 60% pour la reprise
    setProgress(60);
    setStatus("🔍 Recherche approfondie d'adresse personnalisée...");
    
    // Fermer toute connexion SSE existante
    if (window.tokenEventSource) {
      window.tokenEventSource.close();
    }
    
    // Construire l'URL en fonction du mode
    let url = `${API_URL}/token`;
    
    // Paramètres communs aux deux modes
    const params = new URLSearchParams({
      mode: mode,
      language,
      disable_mint: formData.disableMint ? 'true' : 'false',
      custom_address_prefix: formData.customAddressPrefix,
      custom_address_type: formData.customAddressType,
      retry: 'true', // Indiquer que c'est une reprise
      token_name: formData.tokenName,
      token_symbol: formData.tokenSymbol,
      description: formData.description || '',
      image_url: formData.imageIpfsUrl || '',
      metadata_url: formData.metadataIpfsUrl || '',
      website: formData.website || '',
      twitter: formData.twitter || '',
      telegram: formData.telegram || '',
    });
    
    // Utiliser la fonction existante pour configurer la source d'événements
    setupEventSource(url, params);
  };

  const handleUseRandomAddress = () => {
    console.log("🎲 Utilisation d'une adresse aléatoire");
    setShowTimeoutDialog(false);
    setLoading(true);
    
    const params = new URLSearchParams({
      mode: 'create',
      language: language,
      token_name: formData.tokenName,
      token_symbol: formData.tokenSymbol,
      description: formData.description || '',
      image_url: formData.imageFile ? URL.createObjectURL(formData.imageFile) : '',
      metadata_url: formData.metadataIpfsUrl || '',
      website: formData.website || '',
      twitter: formData.twitter || '',
      telegram: formData.telegram || '',
      disable_mint: formData.disableMint.toString(),
      useCustomAddress: 'false',
      custom_address_type: formData.customAddressType,
    });
    
    setupEventSource(`${API_URL}/token`, params);
  };

  const testTimeout = async () => {
    setLoading(true);
    setProgress(0);
    
    console.log("🧪 Test du mécanisme de timeout");
    
    const eventSource = new EventSource(`${API_URL}/test-timeout?language=${language}`);
    
    eventSource.onmessage = function(event) {
      console.log("🧪 TEST REÇU:", event.data);
      
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "timeout") {
          console.log("🧪 TEST TIMEOUT DÉTECTÉ!");
          eventSource.close();
          setLoading(false);
          setShowTimeoutDialog(true);
          return;
        }
        
        if (data.type === 'progress') {
          updateProgress(data.progress || 0, data.message);
        }
      } catch (e) {
        console.error("Erreur de parsing test:", e);
      }
    };
    
    eventSource.onerror = function(error) {
      console.error("❌ ERREUR TEST SSE:", error);
      eventSource.close();
      setLoading(false);
    };
  };

  // Ajouter une fonction pour générer un exemple d'adresse
  const generateAddressExample = (prefix, type) => {
    if (!prefix) return "";
    
    // Générer des caractères aléatoires pour simuler une adresse Solana
    const randomChars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let randomPart = "";
    for (let i = 0; i < 32; i++) {
      randomPart += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
    }
    
    // Créer une adresse qui commence ou se termine par le préfixe
    if (type === 'starts-with') {
      return `${prefix}${randomPart.substring(0, 32 - prefix.length)}`;
    } else {
      return `${randomPart.substring(0, 32 - prefix.length)}${prefix}`;
    }
  };

  useEffect(() => {
    return () => {
      if (window.tokenEventSource) {
        console.log('Nettoyage de la connexion SSE');
        window.tokenEventSource.close();
      }
    };
  }, []);

  return (
    <div className="token-form-container">
      {walletConnected && showForm ? (
        <form className="token-form">
          <div className="form-header">
            <h2 className="form-title">
              <span className="emoji-icon">{mode === 'create' ? '👼' : '😈'}</span>
              {t[mode === 'create' ? 'createToken' : 'copyToken']}
            </h2>
            <div className="mode-selector">
              <button
                type="button"
                className={`mode-button ${mode === 'create' ? 'active' : ''}`}
                onClick={() => setMode('create')}
              >
                {t.newToken}
              </button>
              <button
                type="button"
                className={`mode-button ${mode === 'copy' ? 'active' : ''}`}
                onClick={() => setMode('copy')}
              >
                {t.copyExisting}
              </button>
            </div>
          </div>

          {mode === 'create' ? (
            <div className="form-grid">
              <div className="form-section">
                <h3 className="section-title">
                  <span className="section-icon">📝</span>
                  {t.basicInfo}
                </h3>
                <div className="form-group">
                  <label>
                    {t.tokenName}
                    <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tokenName}
                    onChange={(e) => handleInputChange('tokenName', e.target.value)}
                    placeholder={language === 'en' ? "Ex: My Awesome Token" : "Ex: Mon Super Token"}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>
                    {t.symbol}
                    <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tokenSymbol}
                    onChange={(e) => handleInputChange('tokenSymbol', e.target.value)}
                    placeholder="Ex: MYT"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{t.description}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    placeholder="Describe your token..."
                  />
                </div>
              </div>
              <div className="form-section">
                <h3 className="section-title">
                  <span className="section-icon">📸</span>
                  {t.mediaSection}
                </h3>
                <div className="form-group">
                  <label>
                    {t.tokenImage}
                    <span className="required">*</span>
                  </label>
                  <div className="file-upload">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      id="file-input"
                      required
                    />
                    <label htmlFor="file-input" className="upload-label">
                      {formData.imageFile ? formData.imageFile.name : t.chooseImage}
                    </label>
                  </div>
                </div>
              </div>
              <div className="form-section">
                <h3 className="section-title">
                  <span className="section-icon">🌐</span>
                  {t.socialLinks}
                </h3>
                <div className="form-group">
                  <label>{t.website}</label>
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
                <div className="form-group">
                  <label>{t.twitter}</label>
                  <input
                    type="text"
                    value={formData.twitter}
                    onChange={(e) => handleInputChange('twitter', e.target.value)}
                    placeholder="https://twitter.com/example"
                  />
                </div>
                <div className="form-group">
                  <label>{t.telegram}</label>
                  <input
                    type="text"
                    value={formData.telegram}
                    onChange={(e) => handleInputChange('telegram', e.target.value)}
                    placeholder="https://t.me/example"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="copy-form">
              <div className="form-section">
                <h3 className="section-title">
                  <span className="section-icon">🔍</span>
                  {t.copyAddress}
                </h3>
                <div className="form-group">
                  <input
                    type="text"
                    value={formData.tokenAddress}
                    onChange={(e) => handleInputChange('tokenAddress', e.target.value)}
                    placeholder={t.enterAddress}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          <div className="form-section">
            <div className="form-group checkbox-group">
              <div className="options-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.disableMint}
                    onChange={(e) => handleInputChange('disableMint', e.target.checked)}
                  />
                  <span>🔒 {t.disableMint}</span>
                </label>

                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={formData.useCustomAddress}
                    onChange={(e) => handleInputChange('useCustomAddress', e.target.checked)}
                  />
                  <span>🎯 {t.customAddress}</span>
                </label>

                {formData.useCustomAddress && (
                  <div className="custom-address-container">
                    <div className="custom-address-options">
                      <select 
                        className="custom-address-type-select"
                        value={formData.customAddressType}
                        onChange={(e) => handleInputChange('customAddressType', e.target.value)}
                      >
                        <option value="starts-with">{language === 'fr' ? 'Commence par' : 'Starts with'}</option>
                        <option value="ends-with">{language === 'fr' ? 'Termine par' : 'Ends with'}</option>
                      </select>
                      <input
                        type="text"
                        className="custom-address-input"
                        value={formData.customAddressPrefix}
                        onChange={(e) => {
                          // Limiter à 4 caractères
                          if (e.target.value.length <= 4) {
                            handleInputChange('customAddressPrefix', e.target.value);
                          }
                        }}
                        placeholder={t.customAddressPlaceholder}
                      />
                    </div>
                    <div className="custom-address-example">
                      {formData.customAddressType === 'starts-with' 
                        ? (language === 'fr' ? 'Exemple: adresse commençant par ' : 'Example: address starting with ')
                        : (language === 'fr' ? 'Exemple: adresse se terminant par ' : 'Example: address ending with ')}
                      <strong>{formData.customAddressPrefix || '...'}</strong>
                    </div>
                    {formData.customAddressPrefix && (
                      <div className="custom-address-preview">
                        {generateAddressExample(formData.customAddressPrefix, formData.customAddressType)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <button 
            type="button" 
            className="submit-button"
            onClick={(e) => {
              e.preventDefault();
              handleSubmit(e);
            }}
          >
            {mode === 'create' ? (
              <>
                <span className="button-icon">✨</span>
                {t.createButton}
              </>
            ) : (
              <>
                <span className="button-icon">📋</span>
                {t.copyButton}
              </>
            )}
          </button>
        </form>
      ) : null}
      
      {loading && <ProgressOverlay status={status} progress={progress} />}
      
      {metadata && <TokenReport metadata={metadata} onNewToken={() => setShowForm(true)} />}

      {showTimeoutDialog && (
        <div className="timeout-dialog">
          <div className="timeout-dialog-content">
            <h3 style={{color: '#333', fontSize: '20px', marginBottom: '15px'}}>
              {timeoutMessage}
            </h3>
            <p style={{marginBottom: '20px', color: '#666', fontSize: '14px'}}>
              {language === 'fr'
                ? `La recherche d'une adresse commençant par "${formData.customAddressPrefix}" peut prendre du temps.`
                : `Finding an address starting with "${formData.customAddressPrefix}" may take time.`}
            </p>
            <div className="timeout-dialog-buttons">
              <button 
                className="continue-button"
                onClick={handleContinueSearch}
              >
                {language === 'fr' ? "Continuer la recherche" : "Continue search"}
              </button>
              <button 
                className="random-button"
                onClick={handleUseRandomAddress}
              >
                {language === 'fr' ? "Utiliser une adresse aléatoire" : "Use random address"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pour le débogage uniquement - à supprimer en production */}
      {process.env.NODE_ENV !== 'production' && (
        <button 
          type="button"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 15px',
            background: '#ff5722',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
            zIndex: 9999
          }}
          onClick={testTimeout}
        >
          Test Timeout
        </button>
      )}
    </div>
  );
};

export default TokenForm;
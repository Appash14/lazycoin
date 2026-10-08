import React, { useState, useContext } from 'react';
import './TokenReport.css';
import { LanguageContext } from '../contexts/LanguageContext';
import { translations } from '../translations';

const TokenReport = ({ metadata }) => {
    const { language } = useContext(LanguageContext);
    const t = translations[language];

    console.log("TokenReport reçoit:", metadata);
    
    const [copied, setCopied] = useState(false);
    const [imageError, setImageError] = useState(false);

    if (!metadata || !metadata.address) {
        console.error("Métadonnées invalides:", metadata);
        return <div className="token-report error">
            <h2>{t.errorTitle}</h2>
            <p>{t.errorMessage}</p>
        </div>;
    }

    // Formater les métadonnées pour l'affichage
    const formattedMetadata = {
        name: metadata.name,
        symbol: metadata.symbol,
        supply: metadata.supply || "1000000000",
        address: metadata.address,
        explorer_url: metadata.explorer_url || `https://explorer.solana.com/address/${metadata.address}?cluster=devnet`,
        metadata_url: metadata.metadata_url,
        image: metadata.image,
        description: metadata.description || "",
        website: metadata.website || "",
        twitter: metadata.twitter || "",
        telegram: metadata.telegram || "",
        discord: metadata.discord || "",
        github: metadata.github || "",
        medium: metadata.medium || "",
        reddit: metadata.reddit || ""
    };

    // Fonction pour formater l'URL de l'image
    const formatImageUrl = (imageUrl) => {
        if (!imageUrl) return 'https://via.placeholder.com/120';
        
        // Si l'URL est déjà un lien HTTP complet
        if (imageUrl.startsWith('http')) {
            return imageUrl;
        }
        
        // Si c'est une URL IPFS
        if (imageUrl.startsWith('ipfs://')) {
            return `https://ipfs.io/ipfs/${imageUrl.replace('ipfs://', '')}`;
        }
        
        // Si c'est juste un hash IPFS
        if (!imageUrl.includes('/') && !imageUrl.includes('http')) {
            return `https://ipfs.io/ipfs/${imageUrl}`;
        }
        
        return imageUrl;
    };

    const imageUrl = formatImageUrl(formattedMetadata.image);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(formattedMetadata.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Erreur lors de la copie:', err);
        }
    };

    const handleDownloadKey = async () => {
        try {
            // Au lieu d'utiliser une API, nous allons créer un lien vers le fichier keypair
            // qui devrait être dans le répertoire keypairs du backend
            const keypairFileName = `${formattedMetadata.address}.json`;
            const downloadUrl = `http://localhost:3001/api/download-keypair?address=${formattedMetadata.address}`;
            
            console.log("Téléchargement de la clé depuis:", downloadUrl);
            
            // Créer un élément a temporaire pour le téléchargement
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = keypairFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (error) {
            console.error('Erreur:', error);
            alert(language === 'fr' ? 
                'Erreur lors du téléchargement de la clé privée' : 
                'Error downloading private key');
        }
    };

    // Fonction pour vérifier s'il y a au moins un réseau social configuré
    const hasSocialLinks = () => {
        return formattedMetadata.website || 
               formattedMetadata.twitter || 
               formattedMetadata.telegram ||
               formattedMetadata.discord ||
               formattedMetadata.github ||
               formattedMetadata.medium ||
               formattedMetadata.reddit;
    };

    // Formatter un lien avec le préfixe approprié
    const formatLink = (link, type) => {
        if (!link) return '';
        
        const prefixes = {
            website: 'https://',
            twitter: 'https://twitter.com/',
            telegram: 'https://t.me/',
            discord: 'https://discord.gg/',
            github: 'https://github.com/',
            medium: 'https://medium.com/@',
            reddit: 'https://reddit.com/r/'
        };
        
        if (link.startsWith('http')) return link;
        
        // Nettoyer le lien (enlever @ ou / au début)
        let cleanLink = link;
        if (type !== 'website') {
            cleanLink = link.replace(/^[@/]/, '');
        }
        
        return `${prefixes[type]}${cleanLink}`;
    };

    return (
        <div className="token-report">
            <div className="report-header">
                <div className="token-image-container">
                    <img 
                        src={imageUrl} 
                        alt={formattedMetadata.name} 
                        className="token-image"
                        onError={(e) => {
                            console.error("Erreur de chargement de l'image:", imageUrl);
                            if (!imageError) {
                                // Essayer un autre gateway IPFS
                                if (imageUrl.includes('ipfs.io')) {
                                    e.target.src = imageUrl.replace('ipfs.io', 'gateway.ipfs.io');
                                } else {
                                    e.target.src = 'https://via.placeholder.com/120';
                                }
                                setImageError(true);
                            }
                        }}
                    />
                </div>
                <span className="success-icon">🎉</span>
                <h1>{t.successMessage}</h1>
                <p className="subtitle">{t.successSubtitle}</p>
            </div>

            <div className="report-section">
                <h2>{t.mainInformation}</h2>
                <div className="info-grid">
                    <div className="info-item">
                        <label>{t.nameLabel}</label>
                        <span>{formattedMetadata.name}</span>
                    </div>
                    <div className="info-item">
                        <label>{t.symbolLabel}</label>
                        <span>{formattedMetadata.symbol}</span>
                    </div>
                    <div className="info-item">
                        <label>{t.supplyLabel}</label>
                        <span>{formattedMetadata.supply}</span>
                    </div>
                </div>
                
                {formattedMetadata.description && (
                    <div className="description-container">
                        <label>{t.descriptionLabel}</label>
                        <p className="token-description">{formattedMetadata.description}</p>
                    </div>
                )}
            </div>

            <div className="report-section">
                <h2>{t.addressLabel}</h2>
                <div className="address-container">
                    <code className="token-address">{formattedMetadata.address}</code>
                    <button className="copy-button" onClick={handleCopy}>
                        {copied ? t.copied : t.copyButton}
                    </button>
                </div>
            </div>

            <div className="report-section">
                <h2>{t.linksLabel}</h2>
                <div className="links-container">
                    <a 
                        href={formattedMetadata.explorer_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="social-link blockchain-link"
                    >
                        <span className="link-icon">🔍</span>
                        <span>{t.explorerLink}</span>
                    </a>
                    <a 
                        href={formattedMetadata.metadata_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="social-link blockchain-link"
                    >
                        <span className="link-icon">📄</span>
                        <span>{t.metadataLink}</span>
                    </a>
                    <button 
                        onClick={handleDownloadKey}
                        className="social-link blockchain-link download-key"
                    >
                        <span className="link-icon">🔑</span>
                        <span>{t.downloadKey}</span>
                    </button>
                    
                    {formattedMetadata.website && (
                        <a 
                            href={formatLink(formattedMetadata.website, 'website')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link website-link"
                        >
                            <span className="link-icon">🌐</span>
                            <span>{t.websiteLink}</span>
                        </a>
                    )}
                    
                    {formattedMetadata.twitter && (
                        <a 
                            href={formatLink(formattedMetadata.twitter, 'twitter')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link twitter-link"
                        >
                            <span className="link-icon">🐦</span>
                            <span>{t.twitterLink}</span>
                        </a>
                    )}
                    
                    {formattedMetadata.telegram && (
                        <a 
                            href={formatLink(formattedMetadata.telegram, 'telegram')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link telegram-link"
                        >
                            <span className="link-icon">📱</span>
                            <span>{t.telegramLink}</span>
                        </a>
                    )}
                    
                    {formattedMetadata.discord && (
                        <a 
                            href={formatLink(formattedMetadata.discord, 'discord')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link discord-link"
                        >
                            <span className="link-icon">💬</span>
                            <span>{t.discordLink}</span>
                        </a>
                    )}
                    
                    {formattedMetadata.github && (
                        <a 
                            href={formatLink(formattedMetadata.github, 'github')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link github-link"
                        >
                            <span className="link-icon">📊</span>
                            <span>{t.githubLink}</span>
                        </a>
                    )}
                    
                    {formattedMetadata.medium && (
                        <a 
                            href={formatLink(formattedMetadata.medium, 'medium')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link medium-link"
                        >
                            <span className="link-icon">📝</span>
                            <span>{t.mediumLink}</span>
                        </a>
                    )}
                    
                    {formattedMetadata.reddit && (
                        <a 
                            href={formatLink(formattedMetadata.reddit, 'reddit')}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="social-link reddit-link"
                        >
                            <span className="link-icon">🔴</span>
                            <span>{t.redditLink}</span>
                        </a>
                    )}
                </div>
            </div>

            <div className="action-container">
                <button 
                    className="create-new-button"
                    onClick={() => window.location.reload()}
                >
                    {t.createNewButton}
                </button>
            </div>
        </div>
    );
};

export default TokenReport;
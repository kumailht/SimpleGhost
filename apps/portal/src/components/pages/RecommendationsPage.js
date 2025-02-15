import AppContext from '../../AppContext';
import {useContext, useState, useEffect, useCallback, useMemo} from 'react';
import CloseButton from '../common/CloseButton';
import {clearURLParams} from '../../utils/notifications';
import LoadingPage from './LoadingPage';
import {ReactComponent as CheckmarkIcon} from '../../images/icons/checkmark-fill.svg';
import {ReactComponent as ArrowIcon} from '../../images/icons/arrow-top-right.svg';
import {ReactComponent as LoaderIcon} from '../../images/icons/loader.svg';
import {getRefDomain} from '../../utils/helpers';

export const RecommendationsPageStyles = `
    .gh-portal-recommendation-item .gh-portal-list-detail {
        padding: 4px 24px 4px 0px;
    }

    .gh-portal-recommendation-item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    }

    .gh-portal-recommendation-item-favicon {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    }

    .gh-portal-recommendations-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin-bottom: 20px;
    }

    .gh-portal-recommendations-description {
    text-align: center;
    }

    .gh-portal-recommendation-item .gh-portal-list-detail {
    transition: 0.2s ease-in-out opacity;
    }

    .gh-portal-recommendation-item:hover .gh-portal-list-detail {
    cursor: pointer;
    opacity: 0.8;
    }

    .gh-portal-recommendation-arrow-icon {
    height: 12px;
    opacity: 0;
    margin-left: -6px;
    transition: 0.2s ease-in opacity;
    }

    .gh-portal-recommendation-arrow-icon path {
    stroke-width: 3px;
    stroke: #555;
    }

    .gh-portal-recommendation-item .gh-portal-list-detail:hover .gh-portal-recommendation-arrow-icon {
    opacity: 0.8;
    }
`;

// Fisher-Yates shuffle
// @see https://stackoverflow.com/a/2450976/3015595
const shuffleRecommendations = (array) => {
    let currentIndex = array.length;
    let randomIndex;

    while (currentIndex > 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
    }

    return array;
};

const RecommendationIcon = ({title, favicon, featuredImage}) => {
    const [icon, setIcon] = useState(favicon || featuredImage);

    const hideIcon = () => {
        setIcon(null);
    };

    if (!icon) {
        return null;
    }

    return (<img className="gh-portal-recommendation-item-favicon" src={icon} alt={title} onError={hideIcon} />);
};

const openTab = (url) => {
    const tab = window.open(url, '_blank');
    if (tab) {
        tab.focus();
    } else {
        // Safari fix after async operation / failed to create a new tab
        window.location.href = url;
    }
};

const RecommendationItem = (recommendation) => {
    const {t, onAction, member, site} = useContext(AppContext);
    const {title, url, reason, favicon, one_click_subscribe: oneClickSubscribe, featured_image: featuredImage} = recommendation;
    const allowOneClickSubscribe = member && oneClickSubscribe;
    const [subscribed, setSubscribed] = useState(false);
    const [loading, setLoading] = useState(false);
    const outboundLinkTagging = site.outbound_link_tagging ?? false;

    const refUrl = useMemo(() => {
        if (!outboundLinkTagging) {
            return url;
        }
        try {
            const ref = new URL(url);

            if (ref.searchParams.has('ref') || ref.searchParams.has('utm_source') || ref.searchParams.has('source')) {
                // Don't overwrite + keep existing source attribution
                return url;
            }
            ref.searchParams.set('ref', getRefDomain());
            return ref.toString();
        } catch (_) {
            return url;
        }
    }, [url, outboundLinkTagging]);

    const visitHandler = useCallback(() => {
        // Open url in a new tab
        openTab(refUrl);
    }, [refUrl]);

    const oneClickSubscribeHandler = useCallback(async () => {
        try {
            setLoading(true);
            await onAction('oneClickSubscribe', {
                siteUrl: url,
                throwErrors: true
            });
            setSubscribed(true);
        } catch (_) {
            // Open portal signup page
            const signupUrl = new URL('#/portal/signup', refUrl);

            // Trigger a visit
            openTab(signupUrl);
        }
        setLoading(false);
    }, [setSubscribed, url, refUrl]);

    const clickHandler = useCallback((e) => {
        if (loading) {
            return;
        }
        if (allowOneClickSubscribe) {
            oneClickSubscribeHandler(e);
        } else {
            visitHandler(e);
        }
    }, [loading, allowOneClickSubscribe, oneClickSubscribeHandler, visitHandler]);

    return (
        <section className="gh-portal-recommendation-item">
            <div className="gh-portal-list-detail gh-portal-list-big" onClick={visitHandler}>
                <div className="gh-portal-recommendation-item-header">
                    <RecommendationIcon title={title} favicon={favicon} featuredImage={featuredImage} />
                    <h3>{title}</h3>
                    <ArrowIcon className="gh-portal-recommendation-arrow-icon" />
                </div>
                {reason && <p>{reason}</p>}
            </div>
            <div>
                {subscribed && <CheckmarkIcon className='gh-portal-checkmark-icon' alt='' />}
                {!subscribed && loading && <span className='gh-portal-recommendations-loading-container'><LoaderIcon className={'gh-portal-loadingicon dark'} /></span>}
                {/* {!subscribed && !loading && <button type="button" className="gh-portal-btn gh-portal-btn-list" onClick={clickHandler}>{allowOneClickSubscribe ? t('Subscribe') : t('Visit')}</button>} */}
                {!subscribed && allowOneClickSubscribe && <button type="button" className="gh-portal-btn gh-portal-btn-list" onClick={clickHandler}>{t('Subscribe')}</button>}
            </div>
        </section>
    );
};

const RecommendationsPage = () => {
    const {api, site, pageData, t} = useContext(AppContext);
    const {title, icon} = site;
    const {recommendations_enabled: recommendationsEnabled = false} = site;
    const [recommendations, setRecommendations] = useState(null);

    useEffect(() => {
        api.site.recommendations({limit: 100}).then((data) => {
            setRecommendations(
                shuffleRecommendations(data.recommendations)
            );
        }).catch((err) => {
            // eslint-disable-next-line no-console
            console.error(err);
        });
    }, []);

    // Show 5 recommendations by default
    const [numToShow, setNumToShow] = useState(5);

    const showAllRecommendations = () => {
        setNumToShow(recommendations.length);
    };

    useEffect(() => {
        return () => {
            if (pageData.signup) {
                const deleteParams = [];
                deleteParams.push('action', 'success');
                clearURLParams(deleteParams);
            }
        };
    }, []);

    const heading = pageData && pageData.signup ? t('Welcome to {{siteTitle}}', {siteTitle: title}) : t('Recommendations');
    const subheading = pageData && pageData.signup ? t('Thanks for subscribing. Here are a few other sites you may enjoy. ') : t('Here are a few other sites you may enjoy.');

    if (!recommendationsEnabled) {
        return null;
    }

    if (recommendations === null) {
        return <LoadingPage/>;
    }

    return (
        <div className='gh-portal-content with-footer'>
            <CloseButton />
            <div className="gh-portal-recommendations-header">
                {icon && <img className="gh-portal-signup-logo" alt={title} src={icon} />}
                <h1 className="gh-portal-main-title">{heading}</h1>
            </div>
            <p className="gh-portal-recommendations-description">{subheading}</p>

            <div className="gh-portal-list">
                {recommendations.slice(0, numToShow).map((recommendation, index) => (
                    <RecommendationItem key={index} {...recommendation} />
                ))}
            </div>

            {numToShow < recommendations.length && (
                <footer className='gh-portal-action-footer'>
                    <button className='gh-portal-btn gh-portal-center' style={{width: '100%'}} onClick={showAllRecommendations}>
                        <span>{t('Show all')}</span>
                    </button>
                </footer>
            )}
        </div>
    );
};

export default RecommendationsPage;

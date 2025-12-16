const PUB = window.parent.postMessage;
const SUB = window.parent.addEventListener;

const containerSelector = '#consents';
const REGION_DELIMETER = '~';

const REGION_MAPPING = {
  // Jakarta is app2.
  "app2": {
    api: "https://app2.securiti.ai/",
    cdn: "https://cdn-app2.securiti.ai"
  },
  "app": {
    api: "https://app.securiti.ai/",
    cdn: "https://cdn-prod.securiti.ai"
  },
  "app-eu": {
    api: "https://app.eu.securiti.ai/",
    cdn: "https://cdn-prod.eu.securiti.ai"
  }
}
const VALID_REGION_CODES = Object.keys(REGION_MAPPING);


(function () {
  let config = {};
  let preferenceRef;
  let isIframeLoaded = false

  // Subscribe to window events.
  subscribeEvents();

  function subscribeEvents() {
    SUB('message', async (evt) => {
      // Get event type
      const evtType = getEventType(evt);

      if(!evtType) return;

      switch(evtType.toUpperCase()) {
        case 'INIT_PREFERENCE_CENTER':
          // Store config
          config = evt.data.config;
          config = {
            ...config,
            tenantPrefixedToken: config.tenantId
          }

          handleInitConfig(config);
          break;
        case 'SET_PRIMARY_IDENTIFIER':
          primaryIdentifier = evt.data.value || '';
          if (preferenceRef) {
            preferenceRef.setPrimaryIdentifier(primaryIdentifier);
          }
          break;
        case 'SET_CUSTOM_PARAMETERS':
          const params = evt.data.value || {};
          if (preferenceRef) {
            preferenceRef.setCustomParameters(params);
          }
          break;
        case 'LOAD_PREFERENCE_CENTER':
          preferenceRef && preferenceRef.loadPreferenceCenter(containerSelector)
          break;
        case 'GET_USER_CONSENTS_SNAPSHOT':
          if(preferenceRef) {
            const consents = preferenceRef.getUserConsents()
            sendEvent('USER_CONSENTS_SNAPSHOT', {consents})
          }
          break;
        case 'LOAD_USER_CONSENTS':
          const userConsents = evt.data.consents || {};
          // Load user consents
          if (!!userConsents && Object.keys(userConsents).length) {
            preferenceRef && preferenceRef.loadUserConsents(userConsents);
          }
          break;
        case 'RECORD_CONSENTS':
          preferenceRef && preferenceRef.recordConsents();
          break;
      }
    })
  }

  function handleInitConfig(config) {
    if(!config.implicitFlow) {
      handleExplicitFlow();
    }

    // Split tenant prefixed id.
    const [regionCode, tenantId] = config.tenantPrefixedToken.split(REGION_DELIMETER);

    config.regionCode = regionCode;
    config.tenantId = tenantId;

    loadPlatform(config);

    setTimeout(async () => {
      if(isIframeLoaded) {
        await initSDKConfig(config);
      }
    }, 2000)
  }

  /**
   * It loads the region script and css in the iframe dynamically.
   */
   function loadPlatform(config) {
    // extract the region code
    let regionCode = config.regionCode || null;

    if (!regionCode) {
      console.error("region code not found. Can't load sdk without region code");
      return;
    }

    // If region code was not valid
    if(VALID_REGION_CODES.indexOf(regionCode) === -1) {
      console.error("Invalid region code it should be any of " + VALID_REGION_CODES.toString() +". Can't load sdk without region code");
      return;
    }

    const mapping = REGION_MAPPING[regionCode];

    if(!mapping) {
      console.error("Mapping not found for region ", regionCode);
      return;
    }

    // Build URL's
    const cdnCssURl = `${mapping.cdn}/consent/preference-center.css`;
    const cdnJsUrl = `${mapping.cdn}/consent/preference-center-sdk.js`;

    let iframeNode = document.head

    var scriptTag = document.createElement("script");
    scriptTag.setAttribute("data-securiti-base-url", mapping.api);
    scriptTag.setAttribute("src", cdnJsUrl);

    iframeNode.appendChild(scriptTag);

    let linkTag = document.createElement("link")
    linkTag.setAttribute("rel", "stylesheet")
    linkTag.setAttribute("href", cdnCssURl)

    iframeNode.appendChild(linkTag)

    isIframeLoaded = true
  }

  async function initSDKConfig(config) {
    // If preference already loaded
    // then return the existing ref.
    if (preferenceRef) {
      return;
    }

    // If cdn was not loaded then this obj will not be present.
    if(!window.PreferenceCenterSDK) {
      console.error('SDK was not loaded');
      return;
    }

    preferenceRef = PreferenceCenterSDK.initialize(config);

    if (!preferenceRef || !Object.keys(preferenceRef).length) return;

    // Subscribe to preference center events.
    subscribeSdkEvents();
  }

  function subscribeSdkEvents() {
    if (!preferenceRef || !preferenceRef.events) {
      return;
    }

    const eventsToSubscribe = [
      'INVALID_CONFIG',
      'PREFERENCE_CENTER_LOADED',
      'FAILED_TO_LOAD_PREFERENCE_CENTER',
      'CONSENTS_PROVIDED',
      'CONSENTS_RECORDED',
      'CONSENTS_FAILED_TO_RECORD'
    ]

    eventsToSubscribe.forEach(evt => preferenceRef.events.on(evt, sendEvent.bind(this, evt)));
  }

  function handleExplicitFlow() {
    // If implicitFlow is false we should enable this.
    preferenceRef.events.on('PREFERENCE_CENTER_CONFIG_LOADED', () => {
      preferenceRef.loadPreferenceCenter('#consents');
    })
  }

  // Send event to parent window.
  function sendEvent(type, data) {
    PUB({
      type, data
    }, window.parent.origin)
  }


  //* Utility methods
  function getEventType(evt) {
    return evt.data.type || 'UNKNOWN';
  }
})();
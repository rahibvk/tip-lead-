/* ============================================
   GOV-KER INTELLIGENCE DASHBOARD
   Frontend Logic & Graph Visualization
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const statTips = document.getElementById('statTips');
  const statEntities = document.getElementById('statEntities');
  const alertCount = document.getElementById('alertCount');
  const alertList = document.getElementById('alertList');
  const btnRefresh = document.getElementById('btnRefresh');
  
  const detailPanel = document.getElementById('detailPanel');
  const detailTitle = document.getElementById('detailTitle');
  const detailContent = document.getElementById('detailContent');
  const btnCloseDetail = document.getElementById('btnCloseDetail');

  // Vis.js Network instance
  let network = null;
  let nodes = new vis.DataSet([]);
  let edges = new vis.DataSet([]);

  // Node Color Palette
  const COLORS = {
    Tip: { background: '#ef4444', border: '#b91c1c' }, // Red
    Device: { background: '#6b7280', border: '#4b5563' }, // Gray
    Location: { background: '#10b981', border: '#059669' }, // Green
    Person: { background: '#3b82f6', border: '#2563eb' }, // Blue
    Vehicle: { background: '#f59e0b', border: '#d97706' }, // Amber
    Default: { background: '#8b5cf6', border: '#6d28d9' } // Purple
  };

  // --- Initialize Graph ---
  function initGraph() {
    const container = document.getElementById('networkGraph');
    const data = { nodes: nodes, edges: edges };
    const options = {
      nodes: {
        shape: 'dot',
        size: 16,
        font: { color: '#f3f4f6', size: 12, face: 'Inter' },
        borderWidth: 2,
        shadow: true
      },
      edges: {
        width: 1.5,
        color: { color: '#4b5563', highlight: '#9ca3af' },
        smooth: { type: 'continuous' },
        font: { color: '#9ca3af', size: 10, align: 'top' }
      },
      physics: {
        forceAtlas2Based: {
          gravitationalConstant: -50,
          centralGravity: 0.01,
          springLength: 100,
          springConstant: 0.08
        },
        maxVelocity: 50,
        solver: 'forceAtlas2Based',
        timestep: 0.35,
        stabilization: { iterations: 150 }
      },
      interaction: {
        hover: true,
        tooltipDelay: 200,
        zoomView: true
      }
    };

    network = new vis.Network(container, data, options);

    // Node click handler
    network.on("selectNode", function (params) {
      const nodeId = params.nodes[0];
      const node = nodes.get(nodeId);
      if (node) showNodeDetails(node);
    });

    network.on("deselectNode", function () {
      hideNodeDetails();
    });
  }

  // --- API Fetching ---
  async function fetchStats() {
    try {
      const res = await fetch('/api/dashboard/stats');
      if (res.ok) {
        const stats = await res.json();
        statTips.textContent = stats.total_tips.toLocaleString();
        statEntities.textContent = stats.total_entities.toLocaleString();
        alertCount.textContent = stats.active_chains;
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  }

  async function fetchAlerts() {
    try {
      const res = await fetch('/api/dashboard/alerts');
      if (res.ok) {
        const alerts = await res.json();
        renderAlerts(alerts);
      }
    } catch (e) {
      console.error('Failed to fetch alerts:', e);
      alertList.innerHTML = '<div class="loading-pulse">Error loading alerts</div>';
    }
  }

  async function loadGraphForTip(tipId) {
    try {
      const res = await fetch(`/api/dashboard/graph/${tipId}`);
      if (res.ok) {
        const graphData = await res.json();
        
        // Format nodes for vis.js
        const visNodes = graphData.nodes.map(n => {
          const colorSet = COLORS[n.label] || COLORS.Default;
          
          // Make Tips slightly larger
          let size = 16;
          let icon = undefined;
          if (n.label === 'Tip') size = 24;
          if (n.label === 'Device') size = 12;

          return {
            id: n.id,
            label: n.title,
            title: `[${n.label}] ${n.title}`, // Tooltip
            color: colorSet,
            size: size,
            properties: n.properties,
            groupLabel: n.label // Stored for detail panel
          };
        });

        // Format edges for vis.js
        const visEdges = graphData.edges.map(e => {
          let label = e.label;
          let color = '#4b5563';
          let dashes = false;

          if (e.confidence) {
            label += ` (${Math.round(e.confidence * 100)}%)`;
            // High confidence edges get highlighted
            if (e.confidence >= 0.85) color = '#ef4444';
            else if (e.confidence < 0.5) dashes = true;
          }

          return {
            id: e.id,
            from: e.from,
            to: e.to,
            label: label,
            color: { color: color },
            dashes: dashes
          };
        });

        // Update datasets
        nodes.clear();
        edges.clear();
        nodes.add(visNodes);
        edges.add(visEdges);
        
        // Stabilize and fit
        network.stabilize();
        setTimeout(() => network.fit({ animation: true }), 500);
      }
    } catch (e) {
      console.error('Failed to load graph:', e);
    }
  }

  // --- UI Rendering ---
  function renderAlerts(alerts) {
    alertList.innerHTML = '';
    
    if (!alerts || alerts.length === 0) {
      alertList.innerHTML = '<div class="loading-pulse" style="animation:none; opacity:0.5;">No active chains found.</div>';
      return;
    }

    alerts.forEach(alert => {
      const card = document.createElement('div');
      card.className = 'alert-card';
      card.dataset.tipId = alert.tip1_id; // Store reference to load graph
      
      const timeStr = new Date(alert.discovered_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const confidencePct = Math.round(alert.confidence_score * 100);

      card.innerHTML = `
        <div class="alert-score">
          <span class="score-val">${confidencePct}% MATCH</span>
          <span class="time">${timeStr}</span>
        </div>
        <div class="alert-title">Cross-Device Link</div>
        <div class="alert-desc">Connected via ${alert.shared_type}: <strong>${alert.shared_entity}</strong></div>
      `;

      card.addEventListener('click', () => {
        // Highlight selection
        document.querySelectorAll('.alert-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        // Load graph
        loadGraphForTip(alert.tip1_id);
      });

      alertList.appendChild(card);
    });
  }

  function showNodeDetails(node) {
    detailTitle.textContent = `${node.groupLabel} Details`;
    detailContent.innerHTML = '';

    // Render properties
    const props = node.properties || {};
    
    // Check for images if it's a Tip
    if (node.groupLabel === 'Tip' && props.has_images && props.image_preview) {
      const imgRow = document.createElement('div');
      imgRow.className = 'prop-row';
      imgRow.innerHTML = `
        <span class="prop-key">Evidence Photo</span>
        <img src="${props.image_preview}" class="image-preview" alt="Preview">
      `;
      detailContent.appendChild(imgRow);
    }

    // Render standard properties
    for (const [key, value] of Object.entries(props)) {
      // Skip internal or binary fields
      if (key === 'has_images' || key === 'image_preview') continue;
      
      const row = document.createElement('div');
      row.className = 'prop-row';
      
      // Format timestamps
      let displayValue = value;
      if (key === 'timestamp' && typeof value === 'string') {
        displayValue = new Date(value).toLocaleString();
      }

      row.innerHTML = `
        <span class="prop-key">${key.replace(/_/g, ' ')}</span>
        <span class="prop-val">${displayValue}</span>
      `;
      detailContent.appendChild(row);
    }

    detailPanel.classList.add('visible');
  }

  function hideNodeDetails() {
    detailPanel.classList.remove('visible');
  }

  // --- Events ---
  btnRefresh.addEventListener('click', () => {
    fetchStats();
    fetchAlerts();
    hideNodeDetails();
  });

  btnCloseDetail.addEventListener('click', hideNodeDetails);

  // --- Boot ---
  initGraph();
  fetchStats();
  fetchAlerts();
  
  // Refresh loop (every 30 seconds)
  setInterval(() => {
    fetchStats();
    fetchAlerts();
  }, 30000);

});

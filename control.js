var client = null;
// ****** 重要：請替換成您 Mosquitto Broker 的公開網域名稱或 IP ******
var host = "broker.emqx.io"; 
var port = 8084; // WSS Port

// 定義內建主題，這些主題不會被「清除自訂主題」功能移除
const DEFAULT_TOPICS = [
    "emqx/esp32eqw",             // <--- 拉條的控制與狀態主題
    "emqx/esp32eqw/temp",        // 溫度
    "emqx/esp32eqw/humi",        // 濕度
    "emqx/esp32eqw/light"        // 光照度
];

var subscribedTopics = loadTopicsFromStorage(); 

// --- Local Storage 管理函式 (保持不變) ---

function loadTopicsFromStorage() {
    try {
        const storedTopics = localStorage.getItem('mqtt_topics');
        let allTopics = [...DEFAULT_TOPICS];
        if (storedTopics) {
            const userTopics = JSON.parse(storedTopics);
            allTopics = [...new Set([...allTopics, ...userTopics])];
        }
        return allTopics;
    } catch (e) {
        console.error("無法載入主題列表:", e);
        return DEFAULT_TOPICS;
    }
}

function saveTopicsToStorage(topics) {
    const userTopics = topics.filter(topic => !DEFAULT_TOPICS.includes(topic));
    localStorage.setItem('mqtt_topics', JSON.stringify(userTopics));
}

function renderTopicsList() {
    const listElement = document.getElementById('subscribed-topics-list');
    listElement.innerHTML = ''; 
    
    subscribedTopics.forEach(topic => {
        const li = document.createElement('li');
        li.textContent = topic;
        
        if (!DEFAULT_TOPICS.includes(topic)) {
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '刪除';
            deleteBtn.className = 'delete-btn';
            deleteBtn.onclick = () => deleteTopic(topic);
            li.appendChild(deleteBtn);
        } else {
             li.classList.add('default-topic');
        }
        
        listElement.appendChild(li);
    });
}

function addTopicFromInput() {
    const input = document.getElementById('new-topic-input');
    const topic = input.value.trim();
    input.value = '';

    if (topic && !subscribedTopics.includes(topic)) {
        subscribedTopics.push(topic);
        saveTopicsToStorage(subscribedTopics);
        renderTopicsList();
        
        if (client && client.isConnected()) {
            client.subscribe(topic);
            document.getElementById("messages").innerHTML += `<span> [新增] 立即訂閱新主題: ${topic}</span><br>`;
        }
    } else if (subscribedTopics.includes(topic)) {
        alert("主題已存在或為空。");
    }
}

function deleteTopic(topicToDelete) {
    if (DEFAULT_TOPICS.includes(topicToDelete)) return; 

    subscribedTopics = subscribedTopics.filter(topic => topic !== topicToDelete);
    saveTopicsToStorage(subscribedTopics);
    renderTopicsList();

    if (client && client.isConnected()) {
        client.unsubscribe(topicToDelete);
        document.getElementById("messages").innerHTML += `<span> [刪除] 取消訂閱主題: ${topicToDelete}</span><br>`;
    }
}

function clearTopics() {
    if (confirm("您確定要清除所有自訂主題嗎？（內建主題將保留）")) {
        const topicsToUnsubscribe = subscribedTopics.filter(topic => !DEFAULT_TOPICS.includes(topic));
        subscribedTopics = [...DEFAULT_TOPICS];
        
        saveTopicsToStorage(subscribedTopics);
        renderTopicsList();

        if (client && client.isConnected()) {
            topicsToUnsubscribe.forEach(topic => client.unsubscribe(topic));
            document.getElementById("messages").innerHTML += `<span> [清除] 已取消訂閱所有自訂主題。</span><br>`;
        }
    }
}


// --- MQTT 連線與通訊函式 (連線和發佈函式保持不變) ---

function startConnect() {
    var clientID = "web_client_" + parseInt(Math.random() * 10000); 

    document.getElementById("messages").innerHTML += "<span>嘗試連線至 " + host + ":" + port + " (WSS)</span><br>";
    
    client = new Paho.MQTT.Client(host, port, clientID);

    client.onConnectionLost = onConnectionLost;
    client.onMessageArrived = onMessageArrived;

    var options = {
        timeout: 3,
        useSSL: true, 
        keepAliveInterval: 120,
        onSuccess: onConnect, 
        onFailure: onFailure   
    };
    
    client.connect(options);
}

function onConnect() {
    document.getElementById("connection-status").innerHTML = "已連線";
    document.getElementById("connection-status").className = "connected";
    document.getElementById("messages").innerHTML += "<span>連線成功！開始訂閱所有儲存的主題。</span><br>";

    subscribedTopics.forEach(topic => {
        client.subscribe(topic);
    });
}

function onFailure(message) {
    document.getElementById("connection-status").innerHTML = "連線失敗";
    document.getElementById("connection-status").className = "disconnected";
    document.getElementById("messages").innerHTML += "<span>連線失敗: " + message.errorMessage + "</span><br>";
}

function onConnectionLost(responseObject) {
    document.getElementById("connection-status").innerHTML = "連線遺失";
    document.getElementById("connection-status").className = "disconnected";
    if (responseObject.errorCode !== 0) {
        document.getElementById("messages").innerHTML += "<span>ERROR: 連線遺失: " + responseObject.errorMessage + "</span><br>";
    }
}

function publishMessage(topic, message) {
    if (client && client.isConnected()) {
        var mqttMessage = new Paho.MQTT.Message(message);
        mqttMessage.destinationName = topic;
        mqttMessage.qos = 1;
        client.send(mqttMessage);
        document.getElementById("messages").innerHTML += "<span> [發佈] 主題: " + topic + " | 訊息: " + message + "</span><br>";
    } else {
        // ****** 增加除錯訊息 ******
        if (client) {
             document.getElementById("messages").innerHTML += "<span> [警告] 連線狀態: " + client.isConnected() + "。無法發佈。</span><br>";
        }
        alert("請先連接到 MQTT Broker！");
    }
}


// 3. 處理接收到的訊息 (更新網頁介面)
function onMessageArrived(message) {
    var topic = message.destinationName;
    var payload = message.payloadString;
    
    document.getElementById("messages").innerHTML += "<span> [收到] 主題: " + topic + " | 訊息: " + payload + "</span><br>";

    // ****** 數據更新邏輯：使用您指定的 emqx/esp32eqw/* 主題 ******
    if (topic === "emqx/esp32eqw/temp") {
        document.getElementById("temp-reading").innerHTML = parseFloat(payload).toFixed(1);
    } else if (topic === "emqx/esp32eqw/humi") {
        document.getElementById("humidity-reading").innerHTML = parseFloat(payload).toFixed(0);
    } else if (topic === "emqx/esp32eqw/light") { 
        document.getElementById("lux-reading").innerHTML = parseFloat(payload).toFixed(0);
    } else if (topic === "emqx/esp32eqw") { // <--- 處理拉條的控制與狀態
        var level = parseInt(payload);
        if (!isNaN(level) && level >= 0 && level <= 31) {
            document.getElementById("level-slider").value = level;
            document.getElementById("current-level").innerHTML = level;
        }
    }
    // 其他使用者新增的主題訊息將只顯示在日誌中。
}

// --- 滑桿控制函式 ---

function updateLevelDisplay(level) {
    document.getElementById("current-level").innerHTML = level;
}

// 發佈滑桿數值
function publishLevel(level) {
    // ****** 發佈到emqx/esp32eqw ******
    publishMessage("emqx/esp32eqw", level);
}


// --- 頁面初始化 ---

window.onload = function() {
    renderTopicsList(); 
    startConnect();     

};












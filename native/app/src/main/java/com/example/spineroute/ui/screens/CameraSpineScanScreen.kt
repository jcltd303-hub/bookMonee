package com.example.spineroute.ui.screens

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Camera
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.NearMe
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.SwapHoriz
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Vibration
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.example.spineroute.data.model.Condition
import com.example.spineroute.data.model.DeskItem
import com.example.spineroute.data.model.DetectedSpine
import com.example.spineroute.domain.GeoUtils
import com.example.spineroute.domain.SpineAiAnalyzer
import com.example.spineroute.ui.theme.AccentSage
import com.example.spineroute.ui.theme.BgDark
import com.example.spineroute.ui.theme.BorderDark
import com.example.spineroute.ui.theme.CardHighlight
import com.example.spineroute.ui.theme.FgDark
import com.example.spineroute.ui.theme.MutedDark
import com.example.spineroute.ui.theme.PrimaryAmber
import com.example.spineroute.ui.theme.PrimaryAmberFg
import com.example.spineroute.ui.theme.Surface2Dark
import com.example.spineroute.ui.theme.SurfaceDark
import java.util.concurrent.Executors

@Composable
fun CameraSpineScanScreen(
    currentCondition: Condition,
    activeStopTitle: String = "LFL #10423 Tennyson",
    onClose: () -> Unit,
    onStageBook: (String, DeskItem) -> Unit
) {
    BackHandler { onClose() }

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    fun triggerHapticFeedback() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator?.vibrate(
                    VibrationEffect.createPredefined(VibrationEffect.EFFECT_HEAVY_CLICK)
                )
            } else {
                @Suppress("DEPRECATION")
                val vibrator = context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator?.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(50)
                }
            }
        } catch (_: Exception) {
            // Ignore if vibration unavailable in emulator
        }
    }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    var selectedShelfPreset by remember { mutableIntStateOf(1) }
    var conditionFilter by remember { mutableStateOf(currentCondition) }
    var detectedSpines by remember {
        mutableStateOf(SpineAiAnalyzer.getPresetShelf(1, conditionFilter))
    }
    var selectedSpineId by remember { mutableStateOf<String?>(null) }
    var isTorchOn by remember { mutableStateOf(false) }
    var isHapticEnabled by remember { mutableStateOf(true) }
    var isBarcodeFallbackOpen by remember { mutableStateOf(false) }
    var showResultsSheet by remember { mutableStateOf(true) }
    var isSnapshotFrozen by remember { mutableStateOf(false) }
    var useLiveCameraFeed by remember { mutableStateOf(hasCameraPermission) }
    var minSpreadFilterUsd by remember { mutableStateOf(0f) }

    // Trigger haptic when valuable book (> $15) is loaded
    LaunchedEffect(detectedSpines) {
        if (isHapticEnabled && detectedSpines.any { it.estimatedValue >= 15.0 }) {
            triggerHapticFeedback()
        }
    }

    // Animated scan sweep line (freezes if snapshot is taken)
    val infiniteTransition = rememberInfiniteTransition(label = "scan_laser")
    val laserPosition by infiniteTransition.animateFloat(
        initialValue = 0.1f,
        targetValue = 0.9f,
        animationSpec = infiniteRepeatable(
            animation = tween(2200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "laser_y"
    )

    fun refreshDetections(shelfPreset: Int, condition: Condition = conditionFilter) {
        selectedShelfPreset = shelfPreset
        detectedSpines = SpineAiAnalyzer.getPresetShelf(shelfPreset, condition)
        selectedSpineId = detectedSpines.firstOrNull()?.id
    }

    val visibleSpines = remember(detectedSpines, minSpreadFilterUsd) {
        detectedSpines.filter { it.estimatedValue >= minSpreadFilterUsd }
    }

    Box(modifier = Modifier.fillMaxSize().background(BgDark)) {
        // 1. Camera Viewfinder (Live CameraX or Visual Shelf Simulator)
        if (hasCameraPermission && useLiveCameraFeed && !isSnapshotFrozen) {
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)

                    cameraProviderFuture.addListener({
                        try {
                            val cameraProvider = cameraProviderFuture.get()
                            val preview = Preview.Builder().build().also {
                                it.setSurfaceProvider(previewView.surfaceProvider)
                            }
                            val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA
                            cameraProvider.unbindAll()
                            cameraProvider.bindToLifecycle(lifecycleOwner, cameraSelector, preview)
                        } catch (_: Exception) {
                            useLiveCameraFeed = false
                        }
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                },
                modifier = Modifier.fillMaxSize()
            )
        } else {
            // Visual Shelf Simulator Canvas (renders shelf boards and book spine silhouettes)
            Canvas(modifier = Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height

                // Draw rich wooden bookshelf background
                drawRect(Color(0xFF141A15), Offset.Zero, size)

                // Shelf backboard and horizontal boards
                val topBoardY = h * 0.12f
                val bottomBoardY = h * 0.88f
                drawRect(Color(0xFF263328), Offset(0f, topBoardY), Size(w, 8f))
                drawRect(Color(0xFF263328), Offset(0f, bottomBoardY), Size(w, 14f))

                // Render spine silhouettes
                visibleSpines.forEach { spine ->
                    val r = spine.boundingBox
                    val spineLeft = r.left * w
                    val spineTop = r.top * h
                    val spineWidth = r.width * w
                    val spineHeight = r.height * h

                    // Draw spine book body
                    val isSelected = spine.id == selectedSpineId
                    val spineColor = when {
                        spine.estimatedValue >= 25.0 -> Color(0xFF1B3824)
                        spine.estimatedValue >= 10.0 -> Color(0xFF233527)
                        else -> Color(0xFF1B241D)
                    }
                    drawRoundRect(
                        color = spineColor,
                        topLeft = Offset(spineLeft, spineTop),
                        size = Size(spineWidth, spineHeight),
                        cornerRadius = CornerRadius(8f, 8f)
                    )

                    // Draw subtle spine binding ribs
                    for (i in 1..4) {
                        val ribY = spineTop + (spineHeight * (i * 0.2f))
                        drawLine(
                            color = Color(0x33FFFFFF),
                            start = Offset(spineLeft + 6f, ribY),
                            end = Offset(spineLeft + spineWidth - 6f, ribY),
                            strokeWidth = 2f
                        )
                    }
                }
            }
        }

        // 2. Real-Time AR Bounding Boxes & AI Labels Overlay
        Canvas(
            modifier = Modifier
                .fillMaxSize()
                .clickable {
                    // Tap anywhere on canvas to deselect
                    selectedSpineId = null
                }
        ) {
            val w = size.width
            val h = size.height

            // Animated Laser Scanning Line (runs unless snapshot frozen)
            if (!isSnapshotFrozen) {
                val laserY = laserPosition * h
                drawLine(
                    color = PrimaryAmber.copy(alpha = 0.85f),
                    start = Offset(w * 0.05f, laserY),
                    end = Offset(w * 0.95f, laserY),
                    strokeWidth = 3f
                )
            }

            // Draw bounding boxes for each detected spine
            visibleSpines.forEach { spine ->
                val r = spine.boundingBox
                val isSelected = spine.id == selectedSpineId
                val boxColor = when {
                    isSelected -> PrimaryAmber
                    spine.estimatedValue >= 15.0 -> AccentSage
                    spine.estimatedValue >= 5.0 -> Color(0xFF64B5F6)
                    else -> Color(0xAAFFFFFF)
                }

                // Draw bounding box
                drawRoundRect(
                    color = boxColor,
                    topLeft = Offset(r.left * w, r.top * h),
                    size = Size(r.width * w, r.height * h),
                    cornerRadius = CornerRadius(12f, 12f),
                    style = Stroke(width = if (isSelected) 4f else 2f)
                )

                // Corner accents for camera AI look
                val cornerLen = 16f
                val strokeW = if (isSelected) 5f else 3f
                // Top-Left
                drawLine(boxColor, Offset(r.left * w, r.top * h), Offset(r.left * w + cornerLen, r.top * h), strokeW)
                drawLine(boxColor, Offset(r.left * w, r.top * h), Offset(r.left * w, r.top * h + cornerLen), strokeW)
                // Bottom-Right
                drawLine(boxColor, Offset(r.right * w, r.bottom * h), Offset(r.right * w - cornerLen, r.bottom * h), strokeW)
                drawLine(boxColor, Offset(r.right * w, r.bottom * h), Offset(r.right * w, r.bottom * h - cornerLen), strokeW)
            }
        }

        // 3. Top HUD: Location context, Quick Controls, Condition Slider, Snapshot Freeze
        Column(
            modifier = Modifier
                .align(Alignment.TopCenter)
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Back Button
                IconButton(
                    onClick = onClose,
                    modifier = Modifier
                        .size(40.dp)
                        .background(Color(0xCC1A211C), CircleShape)
                ) {
                    Icon(
                        Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = FgDark,
                        modifier = Modifier.size(20.dp)
                    )
                }

                // Proximity Stop Auto-Sync Banner
                Row(
                    modifier = Modifier
                        .background(Color(0xEE141A15), RoundedCornerShape(12.dp))
                        .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(Icons.Default.NearMe, contentDescription = null, tint = AccentSage, modifier = Modifier.size(14.dp))
                    Text(
                        activeStopTitle,
                        color = FgDark,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        "· 24m away",
                        color = MutedDark,
                        fontSize = 10.sp
                    )
                }

                // HUD Action Icons
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    // Shutter Freeze / Snapshot Button
                    IconButton(
                        onClick = {
                            isSnapshotFrozen = !isSnapshotFrozen
                            if (isHapticEnabled) triggerHapticFeedback()
                        },
                        modifier = Modifier
                            .size(40.dp)
                            .background(if (isSnapshotFrozen) PrimaryAmber else Color(0xCC1A211C), CircleShape)
                    ) {
                        Icon(
                            if (isSnapshotFrozen) Icons.Default.CameraAlt else Icons.Default.Camera,
                            contentDescription = "Freeze Snapshot",
                            tint = if (isSnapshotFrozen) PrimaryAmberFg else FgDark,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Haptic Toggle
                    IconButton(
                        onClick = { isHapticEnabled = !isHapticEnabled },
                        modifier = Modifier
                            .size(40.dp)
                            .background(if (isHapticEnabled) Color(0xCC2E7D32) else Color(0xCC1A211C), CircleShape)
                    ) {
                        Icon(
                            Icons.Default.Vibration,
                            contentDescription = "Haptic Alerts",
                            tint = if (isHapticEnabled) Color(0xFF81C784) else MutedDark,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    // Barcode Fallback Toggle
                    IconButton(
                        onClick = { isBarcodeFallbackOpen = !isBarcodeFallbackOpen },
                        modifier = Modifier
                            .size(40.dp)
                            .background(if (isBarcodeFallbackOpen) PrimaryAmber else Color(0xCC1A211C), CircleShape)
                    ) {
                        Icon(
                            Icons.Default.QrCodeScanner,
                            contentDescription = "Barcode Fallback",
                            tint = if (isBarcodeFallbackOpen) PrimaryAmberFg else FgDark,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }

            // Interactive Condition Grade Selector & Min Spread Slider
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xDD18201B), RoundedCornerShape(10.dp))
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Grade:", fontSize = 11.sp, color = MutedDark, fontWeight = FontWeight.Bold)
                    listOf(Condition.POOR, Condition.FAIR, Condition.GOOD).forEach { cond ->
                        val isSelected = conditionFilter == cond
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(if (isSelected) PrimaryAmber else Surface2Dark)
                                .clickable {
                                    conditionFilter = cond
                                    refreshDetections(selectedShelfPreset, cond)
                                }
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                cond.label.take(4),
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) PrimaryAmberFg else FgDark
                            )
                        }
                    }
                }

                // Min Spread Filter
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Min Offer:", fontSize = 11.sp, color = MutedDark)
                    Text(
                        if (minSpreadFilterUsd == 0f) "All" else "+$${minSpreadFilterUsd.toInt()}",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = AccentSage
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Surface2Dark)
                            .clickable {
                                minSpreadFilterUsd = when (minSpreadFilterUsd) {
                                    0f -> 5f
                                    5f -> 15f
                                    else -> 0f
                                }
                            }
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text("Cycle", fontSize = 9.sp, color = PrimaryAmber)
                    }
                }
            }
        }

        // 4. Barcode Fallback Modal Banner
        AnimatedVisibility(
            visible = isBarcodeFallbackOpen,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .padding(top = 110.dp, start = 16.dp, end = 16.dp)
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, PrimaryAmber, RoundedCornerShape(12.dp))
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = null, tint = PrimaryAmber, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("ISBN Barcode Fallback Active", fontWeight = FontWeight.Bold, color = FgDark, fontSize = 12.sp)
                    }
                    Text(
                        "Point camera at back cover ISBN barcode when spine text is damaged, foil-stamped, or embossed.",
                        fontSize = 11.sp,
                        color = MutedDark
                    )
                }
            }
        }

        // 5. Preset Shelf Quick-Select Pills
        LazyRow(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = if (showResultsSheet) 310.dp else 70.dp)
                .fillMaxWidth()
                .padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val presets = listOf(
                1 to "STEM & Higher-Ed ($70+)",
                2 to "Sci-Fi & Trade ($45+)",
                3 to "CO History & Classics ($55+)",
                4 to "Neighborhood Lawn LFL"
            )
            items(presets) { (id, label) ->
                val selected = selectedShelfPreset == id
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(20.dp))
                        .background(if (selected) PrimaryAmber else Color(0xCC1A211C))
                        .clickable { refreshDetections(id) }
                        .border(1.dp, if (selected) PrimaryAmber else BorderDark, RoundedCornerShape(20.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        text = label,
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                        color = if (selected) PrimaryAmberFg else FgDark
                    )
                }
            }
        }

        // 6. Bottom Sheet: Detected Spines, Store Matrix, Swap Optimizer & Staging
        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
        ) {
            // Toggle drawer bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 6.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                val totalValue = visibleSpines.sumOf { it.estimatedValue }
                Box(
                    modifier = Modifier
                        .background(Color(0xDD1A211C), RoundedCornerShape(8.dp))
                        .padding(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(
                        "Shelf Value: ${GeoUtils.formatUsd(totalValue)} (${visibleSpines.size} Spines)",
                        fontWeight = FontWeight.Bold,
                        color = PrimaryAmber,
                        fontSize = 12.sp
                    )
                }

                Button(
                    onClick = { showResultsSheet = !showResultsSheet },
                    colors = ButtonDefaults.buttonColors(containerColor = SurfaceDark, contentColor = FgDark),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.height(34.dp)
                ) {
                    Icon(
                        if (showResultsSheet) Icons.Default.KeyboardArrowDown else Icons.Default.KeyboardArrowUp,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(if (showResultsSheet) "Hide Tray" else "Show Details", fontSize = 11.sp)
                }
            }

            AnimatedVisibility(
                visible = showResultsSheet,
                enter = slideInVertically(initialOffsetY = { it }),
                exit = slideOutVertically(targetOffsetY = { it })
            ) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(310.dp)
                        .border(1.dp, BorderDark, RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(14.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Recognized Spines & Bidding Desks",
                                style = MaterialTheme.typography.titleMedium,
                                color = FgDark
                            )

                            // Stage All Viable Button
                            Button(
                                onClick = {
                                    visibleSpines.filter { it.estimatedValue >= 3.0 }.forEach { spine ->
                                        val bestQuote = spine.quotes.maxByOrNull { it.offerUsd }
                                        val buyerId = bestQuote?.buyerId ?: spine.bestBuyerId
                                        val item = DeskItem(
                                            isbn = spine.matchedIsbn,
                                            title = spine.cleanedTitle,
                                            offerUsd = spine.estimatedValue,
                                            demandUsd = spine.estimatedValue * 1.5,
                                            lane = spine.lane,
                                            condition = spine.condition
                                        )
                                        onStageBook(buyerId, item)
                                    }
                                    if (isHapticEnabled) triggerHapticFeedback()
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = AccentSage, contentColor = BgDark),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier
                                    .height(32.dp)
                                    .testTag("stage_all_button"),
                                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                            ) {
                                Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Stage All Viable (>$3)", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(8.dp))

                        LazyColumn(
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                            modifier = Modifier.fillMaxSize()
                        ) {
                            items(visibleSpines) { spine ->
                                val isSelected = spine.id == selectedSpineId
                                val bestQuote = spine.quotes.maxByOrNull { it.offerUsd }

                                Card(
                                    colors = CardDefaults.cardColors(
                                        containerColor = if (isSelected) CardHighlight else Surface2Dark
                                    ),
                                    shape = RoundedCornerShape(10.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { selectedSpineId = spine.id }
                                        .border(
                                            1.dp,
                                            if (isSelected) PrimaryAmber else BorderDark,
                                            RoundedCornerShape(10.dp)
                                        )
                                ) {
                                    Column(
                                        modifier = Modifier.padding(10.dp),
                                        verticalArrangement = Arrangement.spacedBy(6.dp)
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Column(modifier = Modifier.weight(1f)) {
                                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                                    Text(
                                                        text = spine.cleanedTitle,
                                                        fontWeight = FontWeight.SemiBold,
                                                        color = FgDark,
                                                        fontSize = 13.sp,
                                                        maxLines = 1
                                                    )
                                                }
                                                Text(
                                                    text = "${spine.matchedAuthor} · ${spine.categoryTag}",
                                                    fontSize = 11.sp,
                                                    color = MutedDark
                                                )
                                                // Highest Buyer Offer Tag
                                                Text(
                                                    text = "Top Buyer: ${spine.bestBuyerName} (${GeoUtils.formatUsd(spine.estimatedValue)})",
                                                    fontSize = 10.sp,
                                                    color = AccentSage,
                                                    fontWeight = FontWeight.Bold
                                                )
                                            }

                                            Column(
                                                horizontalAlignment = Alignment.End,
                                                verticalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Text(
                                                    text = GeoUtils.formatUsd(spine.estimatedValue),
                                                    fontWeight = FontWeight.Bold,
                                                    color = if (spine.estimatedValue >= 10.0) AccentSage else PrimaryAmber,
                                                    fontSize = 14.sp
                                                )

                                                Button(
                                                    onClick = {
                                                        val buyerId = bestQuote?.buyerId ?: spine.bestBuyerId
                                                        val item = DeskItem(
                                                            isbn = spine.matchedIsbn,
                                                            title = spine.cleanedTitle,
                                                            offerUsd = spine.estimatedValue,
                                                            demandUsd = spine.estimatedValue * 1.5,
                                                            lane = spine.lane,
                                                            condition = spine.condition
                                                        )
                                                        onStageBook(buyerId, item)
                                                        if (isHapticEnabled) triggerHapticFeedback()
                                                    },
                                                    colors = ButtonDefaults.buttonColors(
                                                        containerColor = PrimaryAmber,
                                                        contentColor = PrimaryAmberFg
                                                    ),
                                                    shape = RoundedCornerShape(6.dp),
                                                    modifier = Modifier
                                                        .height(28.dp)
                                                        .testTag("stage_spine_${spine.matchedIsbn}"),
                                                    contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                                                ) {
                                                    Text("Stage", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                                }
                                            }
                                        }

                                        // Swap Recommendation Banner (Leave a book, Take a book)
                                        if (spine.swapRecommended) {
                                            Row(
                                                modifier = Modifier
                                                    .fillMaxWidth()
                                                    .background(Color(0xFF14241B), RoundedCornerShape(6.dp))
                                                    .padding(horizontal = 8.dp, vertical = 4.dp),
                                                verticalAlignment = Alignment.CenterVertically,
                                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                                            ) {
                                                Icon(Icons.Default.SwapHoriz, contentDescription = null, tint = AccentSage, modifier = Modifier.size(12.dp))
                                                Text(
                                                    spine.swapSuggestedTitle,
                                                    fontSize = 10.sp,
                                                    color = AccentSage,
                                                    maxLines = 1
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

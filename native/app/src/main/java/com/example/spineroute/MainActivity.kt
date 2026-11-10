package com.example.spineroute

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.spineroute.ui.screens.CameraSpineScanScreen
import com.example.spineroute.ui.screens.DeskScreen
import com.example.spineroute.ui.screens.ReplaceScreen
import com.example.spineroute.ui.screens.RouteScreen
import com.example.spineroute.ui.screens.ScanScreen
import com.example.spineroute.ui.screens.TrainScreen
import com.example.spineroute.ui.theme.BgDark
import com.example.spineroute.ui.theme.BorderDark
import com.example.spineroute.ui.theme.FgDark
import com.example.spineroute.ui.theme.MutedDark
import com.example.spineroute.ui.theme.PrimaryAmber
import com.example.spineroute.ui.theme.PrimaryAmberFg
import com.example.spineroute.ui.theme.SpineRouteTheme
import com.example.spineroute.ui.theme.SurfaceDark
import com.example.spineroute.ui.viewmodel.AppTab
import com.example.spineroute.ui.viewmodel.MainViewModel

class MainActivity : ComponentActivity() {
    private val viewModel: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        setContent {
            SpineRouteTheme {
                val state by viewModel.uiState.collectAsState()
                var isCameraSpineScanOpen by remember { mutableStateOf(false) }

                if (isCameraSpineScanOpen) {
                    val activeStopName = state.route.find { it.stop.id == state.activeStopId }?.stop?.name
                        ?: "LFL #10423 Tennyson"
                    CameraSpineScanScreen(
                        currentCondition = state.scannerCondition,
                        activeStopTitle = activeStopName,
                        onClose = { isCameraSpineScanOpen = false },
                        onStageBook = { buyerId, item ->
                            viewModel.stageItem(buyerId, item)
                        }
                    )
                } else {
                    Scaffold(
                        modifier = Modifier.fillMaxSize().background(BgDark),
                        containerColor = BgDark,
                        topBar = {
                            AppHeader(currentTab = state.currentTab)
                        },
                        bottomBar = {
                            AppBottomNav(
                                currentTab = state.currentTab,
                                onTabSelected = { viewModel.setTab(it) }
                            )
                        }
                    ) { innerPadding ->
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(innerPadding)
                        ) {
                            when (state.currentTab) {
                                AppTab.ROUTE -> RouteScreen(
                                    state = state,
                                    onRegionSelect = { viewModel.setRegion(it) },
                                    onMaxStopsChange = { viewModel.setMaxStops(it) },
                                    onMileBudgetChange = { viewModel.setMileBudget(it) },
                                    onMutualToggle = { viewModel.setShowMutualAid(it) },
                                    onStopSelect = { viewModel.selectStop(it) },
                                    onPlanRoute = { viewModel.planRoute() }
                                )
                                AppTab.SCAN -> ScanScreen(
                                    state = state,
                                    onScanIsbn = { viewModel.scanIsbn(it) },
                                    onConditionChange = { viewModel.setCondition(it) },
                                    onLeaveCountChange = { viewModel.setLeaveCount(it) },
                                    onStagePick = { buyerId, pick -> viewModel.stagePick(buyerId, pick) },
                                    onOpenSpineCamera = { isCameraSpineScanOpen = true }
                                )
                                AppTab.DESK -> DeskScreen(
                                    state = state,
                                    onUnstage = { buyerId, isbn -> viewModel.unstageItem(buyerId, isbn) },
                                    onShipBin = { buyerId -> viewModel.shipBin(buyerId) },
                                    onClearAll = { viewModel.clearAllBins() }
                                )
                                AppTab.REPLACE -> ReplaceScreen()
                                AppTab.TRAIN -> TrainScreen(
                                    state = state,
                                    onTrain = { episodes -> viewModel.trainAgent(episodes) },
                                    onLogPayout = { isbn, title, usd, buyerId, accepted ->
                                        viewModel.logPayout(isbn, title, usd, buyerId, accepted)
                                    },
                                    onResetCalibration = { viewModel.resetCalibration() }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AppHeader(currentTab: AppTab) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(BgDark)
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(PrimaryAmber),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.AutoStories,
                    contentDescription = null,
                    tint = PrimaryAmberFg,
                    modifier = Modifier.size(20.dp)
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = stringResource(R.string.app_subtitle),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    color = PrimaryAmber
                )
                Text(
                    text = stringResource(R.string.app_name),
                    style = MaterialTheme.typography.headlineMedium,
                    color = FgDark,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Hero illustration banner on Route / Home screen
        if (currentTab == AppTab.ROUTE) {
            Spacer(modifier = Modifier.height(10.dp))
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp)
                    .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
            ) {
                Box(modifier = Modifier.fillMaxSize()) {
                    Image(
                        painter = painterResource(id = R.drawable.hero_denver_lfl),
                        contentDescription = "Denver Little Free Libraries",
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(
                                androidx.compose.ui.graphics.Brush.verticalGradient(
                                    colors = listOf(Color.Transparent, Color(0xDD101410))
                                )
                            )
                    )
                    Text(
                        text = "71 mapped book boxes across Denver",
                        color = FgDark,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .align(Alignment.BottomStart)
                            .padding(10.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun AppBottomNav(
    currentTab: AppTab,
    onTabSelected: (AppTab) -> Unit
) {
    NavigationBar(
        containerColor = SurfaceDark,
        tonalElevation = 8.dp,
        modifier = Modifier.border(width = 1.dp, color = BorderDark)
    ) {
        val items = listOf(
            Triple(AppTab.ROUTE, Icons.Default.Explore, "route_tab"),
            Triple(AppTab.SCAN, Icons.Default.QrCodeScanner, "scan_tab"),
            Triple(AppTab.DESK, Icons.Default.Inventory2, "desk_tab"),
            Triple(AppTab.REPLACE, Icons.Default.AutoStories, "replace_tab"),
            Triple(AppTab.TRAIN, Icons.Default.Psychology, "train_tab")
        )

        items.forEach { (tab, icon, testTag) ->
            val selected = currentTab == tab
            NavigationBarItem(
                selected = selected,
                onClick = { onTabSelected(tab) },
                icon = {
                    Icon(
                        imageVector = icon,
                        contentDescription = tab.title,
                        modifier = Modifier.size(22.dp)
                    )
                },
                label = {
                    Text(
                        text = tab.title,
                        fontSize = 11.sp,
                        fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal
                    )
                },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = PrimaryAmberFg,
                    selectedTextColor = PrimaryAmber,
                    indicatorColor = PrimaryAmber,
                    unselectedIconColor = MutedDark,
                    unselectedTextColor = MutedDark
                ),
                modifier = Modifier.testTag(testTag)
            )
        }
    }
}

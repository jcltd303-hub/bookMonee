package com.example.spineroute.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.DirectionsWalk
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Map
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Tune
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
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.spineroute.data.model.LibrariesData
import com.example.spineroute.data.model.PlannedLeg
import com.example.spineroute.data.model.RegionsData
import com.example.spineroute.data.model.Stop
import com.example.spineroute.data.model.StopKind
import com.example.spineroute.domain.GeoUtils
import com.example.spineroute.ui.theme.AccentSage
import com.example.spineroute.ui.theme.BorderDark
import com.example.spineroute.ui.theme.CardHighlight
import com.example.spineroute.ui.theme.FgDark
import com.example.spineroute.ui.theme.MutedDark
import com.example.spineroute.ui.theme.PrimaryAmber
import com.example.spineroute.ui.theme.PrimaryAmberFg
import com.example.spineroute.ui.theme.Surface2Dark
import com.example.spineroute.ui.theme.SurfaceDark
import com.example.spineroute.ui.viewmodel.UiState

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun RouteScreen(
    state: UiState,
    onRegionSelect: (String) -> Unit,
    onMaxStopsChange: (Int) -> Unit,
    onMileBudgetChange: (Double) -> Unit,
    onMutualToggle: (Boolean) -> Unit,
    onStopSelect: (String) -> Unit,
    onPlanRoute: () -> Unit
) {
    val context = LocalContext.current
    var showFilters by remember { mutableStateOf(false) }

    val activeStop = state.route.find { it.stop.id == state.activeStopId }?.stop
        ?: LibrariesData.bookcases.find { it.id == state.activeStopId }
        ?: state.route.firstOrNull()?.stop

    val totalMiles = state.route.sumOf { it.miles }
    val totalCash = state.route.sumOf { it.scoreUsd.coerceAtLeast(0.0) }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Denver region selector chips
        item {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Denver Sections",
                    style = MaterialTheme.typography.titleMedium,
                    color = FgDark,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    RegionsData.allRegions.forEach { region ->
                        val isSelected = state.selectedRegionId == region.id
                        FilterChip(
                            selected = isSelected,
                            onClick = { onRegionSelect(region.id) },
                            label = { Text(region.name, fontSize = 12.sp) },
                            colors = FilterChipDefaults.filterChipColors(
                                selectedContainerColor = PrimaryAmber,
                                selectedLabelColor = PrimaryAmberFg,
                                containerColor = Surface2Dark,
                                labelColor = MutedDark
                            ),
                            border = FilterChipDefaults.filterChipBorder(
                                enabled = true,
                                selected = isSelected,
                                borderColor = if (isSelected) PrimaryAmber else BorderDark
                            ),
                            modifier = Modifier.testTag("region_chip_${region.id}")
                        )
                    }
                }
            }
        }

        // Interactive Denver Schematic Map Visualizer
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Map, contentDescription = null, tint = PrimaryAmber, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Denver Route Loop", style = MaterialTheme.typography.titleMedium, color = FgDark)
                        }
                        IconButton(
                            onClick = { showFilters = !showFilters },
                            modifier = Modifier.size(36.dp)
                        ) {
                            Icon(Icons.Default.Tune, contentDescription = "Settings", tint = if (showFilters) PrimaryAmber else MutedDark)
                        }
                    }

                    Spacer(modifier = Modifier.height(10.dp))

                    // Radar/Schematic Canvas Map
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(200.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(Surface2Dark)
                    ) {
                        Canvas(modifier = Modifier.fillMaxSize()) {
                            val w = size.width
                            val h = size.height

                            // Draw grid lines
                            val gridColor = Color(0xFF2E3830)
                            drawLine(gridColor, Offset(0f, h * 0.33f), Offset(w, h * 0.33f), 1f)
                            drawLine(gridColor, Offset(0f, h * 0.66f), Offset(w, h * 0.66f), 1f)
                            drawLine(gridColor, Offset(w * 0.33f, 0f), Offset(w * 0.33f, h), 1f)
                            drawLine(gridColor, Offset(w * 0.66f, 0f), Offset(w * 0.66f, h), 1f)

                            // Denver bounding reference: Lat: 39.68 to 39.78, Lon: -105.05 to -104.90
                            val minLat = 39.66
                            val maxLat = 39.79
                            val minLon = -105.06
                            val maxLon = -104.88

                            fun toOffset(lat: Double, lon: Double): Offset {
                                val nx = ((lon - minLon) / (maxLon - minLon)).toFloat().coerceIn(0.05f, 0.95f)
                                val ny = (1f - ((lat - minLat) / (maxLat - minLat)).toFloat()).coerceIn(0.05f, 0.95f)
                                return Offset(nx * w, ny * h)
                            }

                            // Start point
                            val startOffset = toOffset(state.startPoint.lat, state.startPoint.lon)
                            drawCircle(color = Color.White, radius = 8f, center = startOffset)
                            drawCircle(color = PrimaryAmber, radius = 5f, center = startOffset)

                            // Route connecting line
                            if (state.route.isNotEmpty()) {
                                var prev = startOffset
                                state.route.forEach { leg ->
                                    val current = toOffset(leg.stop.lat, leg.stop.lon)
                                    drawLine(
                                        color = PrimaryAmber.copy(alpha = 0.8f),
                                        start = prev,
                                        end = current,
                                        strokeWidth = 3f,
                                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
                                    )
                                    prev = current
                                }
                            }

                            // Stops pins
                            val pool = RegionsData.filterStops(LibrariesData.bookcases, state.selectedRegionId)
                            pool.take(45).forEach { stop ->
                                val offset = toOffset(stop.lat, stop.lon)
                                val inRoute = state.route.any { it.stop.id == stop.id }
                                val isActive = stop.id == state.activeStopId

                                if (isActive) {
                                    drawCircle(color = Color.White, radius = 12f, center = offset)
                                    drawCircle(color = PrimaryAmber, radius = 9f, center = offset)
                                } else if (inRoute) {
                                    drawCircle(color = PrimaryAmber, radius = 7f, center = offset)
                                } else {
                                    drawCircle(color = AccentSage.copy(alpha = 0.6f), radius = 4f, center = offset)
                                }
                            }
                        }

                        // Legend overlay
                        Row(
                            modifier = Modifier
                                .align(Alignment.BottomStart)
                                .padding(8.dp)
                                .background(Color(0xCC1A211C), RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp),
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(modifier = Modifier.size(8.dp).background(PrimaryAmber, CircleShape))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Loop", fontSize = 10.sp, color = MutedDark)
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(modifier = Modifier.size(8.dp).background(AccentSage, CircleShape))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Boxes", fontSize = 10.sp, color = MutedDark)
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Metrics Strip
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("LOOP DISTANCE", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text(GeoUtils.formatMiles(totalMiles), style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("EXPECTED YIELD", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text(GeoUtils.formatUsd(totalCash), style = MaterialTheme.typography.titleMedium, color = PrimaryAmber, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("STOPS", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text("${state.route.size}", style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Route Controls Drawer
        if (showFilters) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Max Book Stops: ${state.maxStops}", color = FgDark, style = MaterialTheme.typography.bodyMedium)
                            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                                listOf(2, 4, 6, 8).forEach { count ->
                                    Button(
                                        onClick = { onMaxStopsChange(count) },
                                        colors = ButtonDefaults.buttonColors(
                                            containerColor = if (state.maxStops == count) PrimaryAmber else Surface2Dark,
                                            contentColor = if (state.maxStops == count) PrimaryAmberFg else FgDark
                                        ),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.size(36.dp),
                                        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)
                                    ) {
                                        Text("$count", fontSize = 12.sp)
                                    }
                                }
                            }
                        }

                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("Walking Budget", color = FgDark, style = MaterialTheme.typography.bodyMedium)
                                Text("${state.mileBudget.toInt()} miles", color = PrimaryAmber, fontWeight = FontWeight.Bold)
                            }
                            Slider(
                                value = state.mileBudget.toFloat(),
                                onValueChange = { onMileBudgetChange(it.toDouble()) },
                                valueRange = 2f..14f,
                                steps = 11,
                                colors = SliderDefaults.colors(
                                    thumbColor = PrimaryAmber,
                                    activeTrackColor = PrimaryAmber,
                                    inactiveTrackColor = Surface2Dark
                                )
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Show Mutual Aid (Fridges & Pantries)", color = FgDark, style = MaterialTheme.typography.bodyMedium)
                            Switch(
                                checked = state.showMutualAid,
                                onCheckedChange = onMutualToggle,
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = PrimaryAmber,
                                    checkedTrackColor = CardHighlight
                                )
                            )
                        }

                        Button(
                            onClick = onPlanRoute,
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber, contentColor = PrimaryAmberFg),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth().height(48.dp)
                        ) {
                            Icon(Icons.Default.Navigation, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Recalculate Optimal Loop", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }

        // Active Stop Highlight Card
        activeStop?.let { stop ->
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, PrimaryAmber.copy(alpha = 0.5f), RoundedCornerShape(16.dp))
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = stop.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = FgDark,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = if (stop.address.isNotBlank()) stop.address else "${stop.neighborhood}, Denver",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MutedDark
                                )
                            }
                            if (stop.charter.isNotBlank()) {
                                Box(
                                    modifier = Modifier
                                        .background(Surface2Dark, RoundedCornerShape(6.dp))
                                        .padding(horizontal = 8.dp, vertical = 4.dp)
                                ) {
                                    Text("Charter ${stop.charter}", color = AccentSage, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                                }
                            }
                        }

                        if (stop.notes.isNotBlank()) {
                            Text(stop.notes, style = MaterialTheme.typography.bodyMedium, color = FgDark)
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Button(
                                onClick = {
                                    val uri = Uri.parse(GeoUtils.walkUrl(stop.lat, stop.lon))
                                    val intent = Intent(Intent.ACTION_VIEW, uri)
                                    context.startActivity(intent)
                                },
                                colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber, contentColor = PrimaryAmberFg),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(44.dp).testTag("directions_button")
                            ) {
                                Icon(Icons.AutoMirrored.Filled.DirectionsWalk, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Walk Here", fontWeight = FontWeight.Bold)
                            }

                            OutlinedButton(
                                onClick = { onStopSelect(stop.id) },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(44.dp)
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = AccentSage, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Check-In", color = FgDark)
                            }
                        }
                    }
                }
            }
        }

        // Ordered Planned Stops List
        item {
            Text(
                text = "Planned Sequence (${state.route.size} stops)",
                style = MaterialTheme.typography.titleMedium,
                color = FgDark
            )
        }

        itemsIndexed(state.route) { index, leg ->
            val isSelected = leg.stop.id == state.activeStopId
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = if (isSelected) CardHighlight else SurfaceDark
                ),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onStopSelect(leg.stop.id) }
                    .border(1.dp, if (isSelected) PrimaryAmber else BorderDark, RoundedCornerShape(12.dp))
                    .testTag("stop_item_${leg.stop.id}")
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(28.dp)
                            .background(if (isSelected) PrimaryAmber else Surface2Dark, CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "${index + 1}",
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) PrimaryAmberFg else FgDark,
                            fontSize = 12.sp
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = leg.stop.name,
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = FgDark
                        )
                        Text(
                            text = if (leg.stop.address.isNotBlank()) leg.stop.address else leg.stop.neighborhood,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedDark
                        )
                    }

                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            text = GeoUtils.formatMiles(leg.miles),
                            style = MaterialTheme.typography.bodyMedium,
                            color = FgDark,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = GeoUtils.formatUsd(leg.scoreUsd),
                            style = MaterialTheme.typography.labelSmall,
                            color = PrimaryAmber,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

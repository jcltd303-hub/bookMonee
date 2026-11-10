package com.example.spineroute.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.domain.GeoUtils
import com.example.spineroute.domain.QTrader
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TrainScreen(
    state: UiState,
    onTrain: (Int) -> Unit,
    onLogPayout: (String, String, Double, String, Boolean) -> Unit,
    onResetCalibration: () -> Unit
) {
    val q = state.qAgent
    val policies = remember(q) { QTrader.evaluatePolicy(q) }

    var inputIsbn by remember { mutableStateOf(state.picks.firstOrNull()?.isbn ?: "") }
    var inputTitle by remember { mutableStateOf(state.picks.firstOrNull()?.title ?: "") }
    var inputUsd by remember { mutableStateOf("") }
    var selectedBuyerId by remember { mutableStateOf(BuyersData.allBuyers.first().id) }
    var accepted by remember { mutableStateOf(true) }
    var buyerDropdownExpanded by remember { mutableStateOf(false) }

    val totalEarned = state.payouts.sumOf { it.usd }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Q-Learning Agent Status
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Psychology, contentDescription = null, tint = PrimaryAmber, modifier = Modifier.size(24.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("On-Device Trading Agent", style = MaterialTheme.typography.titleLarge, color = FgDark)
                    }

                    Text(
                        "Q-learning over three actions: SKIP, STAGE, or SHIP. The agent decides whether a copy is worth the 99¢ unit acquisition cost plus packing friction. Trains on-device against simulated market shelves.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MutedDark
                    )

                    // Synchronized Commit & Build Stamp (Synced with jcltd303-hub/bookMonee @ e9763ee)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Surface2Dark)
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            "Build e9763ee · Upstream Synced",
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = AccentSage
                        )
                        Text(
                            "yolo/obb spine sync",
                            fontSize = 10.sp,
                            color = MutedDark
                        )
                    }

                    // 4-Quadrant Metrics
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(Surface2Dark)
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceAround
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("SIMULATED", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text("${q.episodes}", style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("Q-UPDATES", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text("${q.steps}", style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("MEAN REWARD", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text(GeoUtils.formatUsd(q.avgReward), style = MaterialTheme.typography.titleMedium, color = PrimaryAmber, fontWeight = FontWeight.Bold)
                        }
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("EPSILON ε", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                            Text("%.3f".format(q.eps), style = MaterialTheme.typography.titleMedium, color = AccentSage, fontWeight = FontWeight.Bold)
                        }
                    }

                    if (state.isTraining) {
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            LinearProgressIndicator(
                                progress = { state.trainingProgress / 100f },
                                modifier = Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)),
                                color = PrimaryAmber,
                                trackColor = Surface2Dark
                            )
                            Text("Simulating market shelves... ${state.trainingProgress}%", fontSize = 11.sp, color = MutedDark)
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(
                            onClick = { onTrain(600) },
                            enabled = !state.isTraining,
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f).height(44.dp).testTag("train_600_button")
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Train 600", color = FgDark)
                        }

                        Button(
                            onClick = { onTrain(3000) },
                            enabled = !state.isTraining,
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber, contentColor = PrimaryAmberFg),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f).height(44.dp).testTag("train_3000_button")
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Train 3,000", fontWeight = FontWeight.Bold)
                        }
                    }

                    // Policy Table
                    Text("Current Optimal Action Policy:", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Surface2Dark)
                            .padding(10.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        policies.forEach { row ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(row.label, fontSize = 11.sp, color = MutedDark, modifier = Modifier.weight(1f))
                                Text(row.action, fontSize = 11.sp, color = PrimaryAmber, fontWeight = FontWeight.SemiBold)
                            }
                        }
                    }
                }
            }
        }

        // Desk Calibration Section
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Desk Pay Rate Calibration", style = MaterialTheme.typography.titleMedium, color = FgDark)
                        Box(
                            modifier = Modifier
                                .background(CardHighlight, RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text("MODELLED PRIORS", fontSize = 10.sp, color = PrimaryAmber, fontWeight = FontWeight.Bold)
                        }
                    }

                    Text(
                        "Each logged payout is folded into that desk's pay rate. The prior holds steady until sufficient observations calibrate the real spread.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MutedDark
                    )

                    // Calibration Table
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Surface2Dark)
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Desk", fontSize = 11.sp, color = MutedDark, fontWeight = FontWeight.Bold)
                            Text("Prior", fontSize = 11.sp, color = MutedDark, fontWeight = FontWeight.Bold)
                            Text("Adjusted", fontSize = 11.sp, color = MutedDark, fontWeight = FontWeight.Bold)
                            Text("Obs", fontSize = 11.sp, color = MutedDark, fontWeight = FontWeight.Bold)
                        }

                        state.calibration.forEach { cal ->
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(cal.buyerName, fontSize = 12.sp, color = FgDark)
                                Text("%.2f".format(cal.priorRate), fontSize = 12.sp, color = MutedDark)
                                Text("%.2f".format(cal.adjustedRate), fontSize = 12.sp, color = PrimaryAmber, fontWeight = FontWeight.Bold)
                                Text("${cal.observations}", fontSize = 12.sp, color = MutedDark)
                            }
                        }
                    }

                    OutlinedButton(
                        onClick = onResetCalibration,
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth().height(38.dp)
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = null, tint = MutedDark, modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Reset to Baseline Priors", color = MutedDark, fontSize = 12.sp)
                    }
                }
            }
        }

        // Payout Logger Form
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Log a Real Buyback Payout", style = MaterialTheme.typography.titleMedium, color = FgDark)

                    OutlinedTextField(
                        value = inputIsbn,
                        onValueChange = { inputIsbn = it },
                        label = { Text("ISBN-13") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryAmber,
                            unfocusedBorderColor = BorderDark,
                            focusedTextColor = FgDark,
                            unfocusedTextColor = FgDark
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )

                    OutlinedTextField(
                        value = inputTitle,
                        onValueChange = { inputTitle = it },
                        label = { Text("Book Title") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryAmber,
                            unfocusedBorderColor = BorderDark,
                            focusedTextColor = FgDark,
                            unfocusedTextColor = FgDark
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )

                    OutlinedTextField(
                        value = inputUsd,
                        onValueChange = { inputUsd = it },
                        label = { Text("Dollars Received ($)") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryAmber,
                            unfocusedBorderColor = BorderDark,
                            focusedTextColor = FgDark,
                            unfocusedTextColor = FgDark
                        ),
                        shape = RoundedCornerShape(10.dp)
                    )

                    // Buyer Dropdown
                    ExposedDropdownMenuBox(
                        expanded = buyerDropdownExpanded,
                        onExpandedChange = { buyerDropdownExpanded = it }
                    ) {
                        OutlinedTextField(
                            value = BuyersData.getName(selectedBuyerId),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Buyer Desk") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = buyerDropdownExpanded) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = PrimaryAmber,
                                unfocusedBorderColor = BorderDark,
                                focusedTextColor = FgDark,
                                unfocusedTextColor = FgDark
                            ),
                            shape = RoundedCornerShape(10.dp)
                        )
                        ExposedDropdownMenu(
                            expanded = buyerDropdownExpanded,
                            onDismissRequest = { buyerDropdownExpanded = false }
                        ) {
                            BuyersData.allBuyers.forEach { buyer ->
                                DropdownMenuItem(
                                    text = { Text(buyer.name) },
                                    onClick = {
                                        selectedBuyerId = buyer.id
                                        buyerDropdownExpanded = false
                                    }
                                )
                            }
                        }
                    }

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(vertical = 4.dp)
                    ) {
                        Checkbox(
                            checked = accepted,
                            onCheckedChange = { accepted = it },
                            colors = CheckboxDefaults.colors(checkedColor = PrimaryAmber)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Buyer accepted shipment and released cash", color = FgDark, fontSize = 12.sp)
                    }

                    Button(
                        onClick = {
                            val amount = inputUsd.toDoubleOrNull() ?: 0.0
                            if (inputIsbn.isNotBlank()) {
                                onLogPayout(inputIsbn, inputTitle, amount, selectedBuyerId, accepted)
                                inputUsd = ""
                            }
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber, contentColor = PrimaryAmberFg),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth().height(46.dp).testTag("log_payout_button")
                    ) {
                        Icon(Icons.Default.Calculate, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Record & Train on Payout", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // Payouts Ledger
        if (state.payouts.isNotEmpty()) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Payouts Ledger", style = MaterialTheme.typography.titleMedium, color = FgDark)
                    Text("Total: ${GeoUtils.formatUsd(totalEarned)}", color = AccentSage, fontWeight = FontWeight.Bold)
                }
            }

            items(state.payouts) { payout ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(10.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(payout.title, fontWeight = FontWeight.SemiBold, color = FgDark, fontSize = 13.sp)
                            Text(
                                "${BuyersData.getName(payout.buyerId)} · ${if (payout.accepted) "Accepted" else "Rejected"}",
                                fontSize = 11.sp,
                                color = MutedDark
                            )
                        }
                        Text(GeoUtils.formatUsd(payout.usd), fontWeight = FontWeight.Bold, color = PrimaryAmber, fontSize = 14.sp)
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

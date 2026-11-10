package com.example.spineroute.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoFixHigh
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Search
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.example.spineroute.data.model.BooksData
import com.example.spineroute.data.model.BuyerQuote
import com.example.spineroute.data.model.BuyersData
import com.example.spineroute.data.model.Condition
import com.example.spineroute.data.model.Judgement
import com.example.spineroute.domain.GeoUtils
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
import com.example.spineroute.ui.viewmodel.UiState

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ScanScreen(
    state: UiState,
    onScanIsbn: (String) -> Unit,
    onConditionChange: (Condition) -> Unit,
    onLeaveCountChange: (Int) -> Unit,
    onStagePick: (String, Judgement) -> Unit,
    onOpenSpineCamera: () -> Unit
) {
    val context = LocalContext.current
    val keyboardController = LocalSoftwareKeyboardController.current
    var inputIsbn by remember { mutableStateOf("") }
    val leavesLeft = (state.leaveCount - state.boxTakes).coerceAtLeast(0)
    val latestPick = state.picks.firstOrNull()

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // AI Spine Camera Hero Banner
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = CardHighlight),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, PrimaryAmber, RoundedCornerShape(16.dp))
                    .clickable { onOpenSpineCamera() }
                    .testTag("open_spine_camera_banner")
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(52.dp)
                            .clip(CircleShape)
                            .background(PrimaryAmber),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.CameraAlt,
                            contentDescription = null,
                            tint = PrimaryAmberFg,
                            modifier = Modifier.size(28.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(14.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                "Spine Camera (On-Device AI)",
                                style = MaterialTheme.typography.titleMedium,
                                color = FgDark,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Text(
                            "Scan shelf spines with the camera. On-device AI detects titles, matches catalog demand, and shows quotes in real time.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MutedDark,
                            fontSize = 12.sp
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(PrimaryAmber)
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(
                                "Launch Camera Vision →",
                                color = PrimaryAmberFg,
                                fontWeight = FontWeight.Bold,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }

        // Shelf Header & Replacement Bag Counter
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
                        Column {
                            Text("Shelf Scanner", style = MaterialTheme.typography.titleLarge, color = FgDark)
                            Text("Pan across spines or enter ISBN", style = MaterialTheme.typography.bodyMedium, color = MutedDark)
                        }
                        Box(
                            modifier = Modifier
                                .background(if (leavesLeft > 0) AccentSage.copy(alpha = 0.2f) else BorderDark, RoundedCornerShape(8.dp))
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(
                                "$leavesLeft replacements left",
                                color = if (leavesLeft > 0) AccentSage else MutedDark,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    // Replacements control
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Replacements in bag:", color = FgDark, style = MaterialTheme.typography.bodyMedium)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            IconButton(
                                onClick = { onLeaveCountChange(state.leaveCount - 1) },
                                modifier = Modifier.size(36.dp).background(Surface2Dark, CircleShape)
                            ) {
                                Icon(Icons.Default.Remove, contentDescription = "Fewer", tint = FgDark, modifier = Modifier.size(18.dp))
                            }
                            Text(
                                text = "${state.leaveCount}",
                                color = FgDark,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier.padding(horizontal = 16.dp)
                            )
                            IconButton(
                                onClick = { onLeaveCountChange(state.leaveCount + 1) },
                                modifier = Modifier.size(36.dp).background(Surface2Dark, CircleShape)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "More", tint = FgDark, modifier = Modifier.size(18.dp))
                            }
                        }
                    }

                    // Condition selector
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Condition:", color = FgDark, style = MaterialTheme.typography.bodyMedium)
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Condition.entries.forEach { cond ->
                                val selected = state.scannerCondition == cond
                                FilterChip(
                                    selected = selected,
                                    onClick = { onConditionChange(cond) },
                                    label = { Text(cond.label, fontSize = 12.sp) },
                                    colors = FilterChipDefaults.filterChipColors(
                                        selectedContainerColor = PrimaryAmber,
                                        selectedLabelColor = PrimaryAmberFg,
                                        containerColor = Surface2Dark,
                                        labelColor = MutedDark
                                    ),
                                    border = FilterChipDefaults.filterChipBorder(
                                        enabled = true,
                                        selected = selected,
                                        borderColor = if (selected) PrimaryAmber else BorderDark
                                    )
                                )
                            }
                        }
                    }
                }
            }
        }

        // ISBN Input and Scan Action
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = inputIsbn,
                        onValueChange = { inputIsbn = it },
                        modifier = Modifier.fillMaxWidth().testTag("isbn_input"),
                        label = { Text("Enter or scan ISBN-10 or 13") },
                        placeholder = { Text("e.g. 9781119659587") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Search
                        ),
                        keyboardActions = KeyboardActions(
                            onSearch = {
                                if (inputIsbn.isNotBlank()) {
                                    onScanIsbn(inputIsbn)
                                    keyboardController?.hide()
                                }
                            }
                        ),
                        trailingIcon = {
                            if (inputIsbn.isNotBlank()) {
                                IconButton(onClick = { inputIsbn = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = "Clear", tint = MutedDark)
                                }
                            }
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = PrimaryAmber,
                            unfocusedBorderColor = BorderDark,
                            focusedTextColor = FgDark,
                            unfocusedTextColor = FgDark,
                            focusedLabelColor = PrimaryAmber,
                            unfocusedLabelColor = MutedDark
                        ),
                        shape = RoundedCornerShape(12.dp)
                    )

                    state.scanErrorMessage?.let {
                        Text(it, color = Color(0xFFEF5350), fontSize = 12.sp)
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = {
                                if (inputIsbn.isNotBlank()) {
                                    onScanIsbn(inputIsbn)
                                    keyboardController?.hide()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber, contentColor = PrimaryAmberFg),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.weight(1f).height(46.dp).testTag("lookup_button")
                        ) {
                            Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Look Up Quotes", fontWeight = FontWeight.Bold)
                        }

                        OutlinedButton(
                            onClick = {
                                // Simulate spine scan of random high-yield candidate
                                val randomCandidate = BooksData.catalog.random()
                                inputIsbn = randomCandidate.isbn13
                                onScanIsbn(randomCandidate.isbn13)
                            },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.height(46.dp).testTag("camera_scan_button")
                        ) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null, tint = AccentSage, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Spine Cam", color = FgDark)
                        }
                    }

                    // Quick Sample Catalog Buttons
                    Text("Quick Test Spines:", fontSize = 11.sp, color = MutedDark)
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        verticalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf(
                            "Organic Chem" to "9781119659587",
                            "Gray's Anatomy" to "9780443069529",
                            "Campbell Bio" to "9780134093413",
                            "DSM-5" to "9780890425558",
                            "Lord of the Rings" to "9780544003415"
                        ).forEach { (name, code) ->
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(Surface2Dark)
                                    .clickable {
                                        inputIsbn = code
                                        onScanIsbn(code)
                                    }
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text(name, fontSize = 11.sp, color = FgDark)
                            }
                        }
                    }
                }
            }
        }

        // Active Judgement Card
        latestPick?.let { pick ->
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = CardHighlight),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, PrimaryAmber, RoundedCornerShape(16.dp))
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.Top
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    pick.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    color = FgDark,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    "${pick.author} · ${pick.lane.label} · ${pick.condition.label}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MutedDark
                                )
                                Text(
                                    "ISBN: ${pick.isbn}",
                                    fontSize = 11.sp,
                                    color = AccentSage
                                )
                            }

                            // Decision Badge
                            Box(
                                modifier = Modifier
                                    .background(
                                        if (pick.decision == "take") AccentSage else Color(0xFFEF5350),
                                        RoundedCornerShape(8.dp)
                                    )
                                    .padding(horizontal = 12.dp, vertical = 6.dp)
                            ) {
                                Text(
                                    pick.decision.uppercase(),
                                    fontWeight = FontWeight.ExtraBold,
                                    color = BgDark,
                                    fontSize = 13.sp
                                )
                            }
                        }

                        // Decision explanation
                        Text(
                            text = pick.reason,
                            style = MaterialTheme.typography.bodyMedium,
                            color = FgDark
                        )

                        // Comparator external link
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                "Prior: ${GeoUtils.formatUsd(pick.priorUsd)} (${pick.lane.label})",
                                fontSize = 12.sp,
                                color = MutedDark
                            )
                            Box(
                                modifier = Modifier
                                    .clickable {
                                        val uri = Uri.parse(BuyersData.comparatorUrl(pick.isbn))
                                        context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                    }
                                    .padding(4.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text("Verify on BookScouter", fontSize = 11.sp, color = PrimaryAmber)
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Icon(Icons.Default.OpenInNew, contentDescription = null, tint = PrimaryAmber, modifier = Modifier.size(12.dp))
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))

                        // Desk Quotes Table
                        Text("Desk Offers (Prepaid Labels):", style = MaterialTheme.typography.labelSmall, color = MutedDark)
                        state.currentQuotes.forEach { quote ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(SurfaceDark)
                                    .padding(horizontal = 10.dp, vertical = 8.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(quote.buyerName, fontWeight = FontWeight.SemiBold, color = FgDark, fontSize = 13.sp)
                                    Text(
                                        if (quote.thresholdUsd > 0) "Label min: $${quote.thresholdUsd}" else "No min",
                                        fontSize = 10.sp,
                                        color = MutedDark
                                    )
                                }

                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        GeoUtils.formatUsd(quote.offerUsd),
                                        fontWeight = FontWeight.Bold,
                                        color = if (quote.offerUsd > 2.0) PrimaryAmber else FgDark,
                                        fontSize = 14.sp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Button(
                                        onClick = { onStagePick(quote.buyerId, pick) },
                                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryAmber, contentColor = PrimaryAmberFg),
                                        shape = RoundedCornerShape(6.dp),
                                        modifier = Modifier.height(30.dp),
                                        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                                    ) {
                                        Text("Stage", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Recent Scans History
        if (state.picks.size > 1) {
            item {
                Text(
                    text = "Recent Shelf Reads",
                    style = MaterialTheme.typography.titleMedium,
                    color = FgDark
                )
            }

            items(state.picks.drop(1)) { itemPick ->
                Card(
                    colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(10.dp))
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(itemPick.title, fontWeight = FontWeight.SemiBold, color = FgDark, fontSize = 13.sp)
                            Text("${itemPick.author} · ${itemPick.isbn}", fontSize = 11.sp, color = MutedDark)
                        }
                        Box(
                            modifier = Modifier
                                .background(if (itemPick.decision == "take") AccentSage.copy(alpha = 0.2f) else BorderDark, RoundedCornerShape(6.dp))
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                itemPick.decision.uppercase(),
                                color = if (itemPick.decision == "take") AccentSage else MutedDark,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }
        }

        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

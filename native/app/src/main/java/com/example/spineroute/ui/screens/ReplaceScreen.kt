package com.example.spineroute.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoStories
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.spineroute.data.model.Deal
import com.example.spineroute.data.model.DealKind
import com.example.spineroute.data.model.DealsData
import com.example.spineroute.ui.theme.AccentSage
import com.example.spineroute.ui.theme.BorderDark
import com.example.spineroute.ui.theme.FgDark
import com.example.spineroute.ui.theme.MutedDark
import com.example.spineroute.ui.theme.PrimaryAmber
import com.example.spineroute.ui.theme.SurfaceDark

@Composable
fun ReplaceScreen() {
    val context = LocalContext.current
    val replacements = DealsData.getByKind(DealKind.REPLACEMENT)
    val maps = DealsData.getByKind(DealKind.MAP)
    val boards = DealsData.getByKind(DealKind.BOARD)

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = SurfaceDark),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().border(1.dp, BorderDark, RoundedCornerShape(16.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.VolunteerActivism, contentDescription = null, tint = AccentSage, modifier = Modifier.size(22.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Replace What You Take", style = MaterialTheme.typography.titleLarge, color = FgDark)
                    }

                    Text(
                        "The loop only works if a book goes back in the box. Denver's Little Free Libraries are sustained by neighbors. Use these community sources for free or bulk replacement stock.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MutedDark
                    )
                }
            }
        }

        // Free & Cheap Stock
        item {
            Text("Free and Cheap Replacement Stock", style = MaterialTheme.typography.titleMedium, color = FgDark)
        }
        items(replacements) { deal ->
            DealCard(deal = deal, onOpen = { openUrl(context, deal.url) })
        }

        // Maps That Fill The Gaps
        item {
            Text("Maps That Fill The Gaps", style = MaterialTheme.typography.titleMedium, color = FgDark)
        }
        items(maps) { deal ->
            DealCard(deal = deal, onOpen = { openUrl(context, deal.url) })
        }

        // Marketplaces & Boards
        item {
            Text("Boards & Comparative Tools", style = MaterialTheme.typography.titleMedium, color = FgDark)
        }
        items(boards) { deal ->
            DealCard(deal = deal, onOpen = { openUrl(context, deal.url) })
        }

        item { Spacer(modifier = Modifier.height(80.dp)) }
    }
}

@Composable
fun DealCard(deal: Deal, onOpen: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = SurfaceDark),
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onOpen() }
            .border(1.dp, BorderDark, RoundedCornerShape(12.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(deal.title, style = MaterialTheme.typography.titleMedium, color = FgDark, fontWeight = FontWeight.Bold)
                Icon(Icons.Default.OpenInNew, contentDescription = "Open", tint = PrimaryAmber, modifier = Modifier.size(16.dp))
            }
            Text(deal.source, fontSize = 12.sp, color = PrimaryAmber, fontWeight = FontWeight.Medium)
            Text(deal.note, style = MaterialTheme.typography.bodyMedium, color = MutedDark)
        }
    }
}

private fun openUrl(context: android.content.Context, url: String) {
    try {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        context.startActivity(intent)
    } catch (_: Exception) {}
}
